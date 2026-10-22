"""Render only measured groups after all twelve accepted runs have stopped."""
import collections
import json
from pathlib import Path
import statistics
import sys

sys.dont_write_bytecode=True
from analyze_scheduler_trace import E, DOMAINS, stats, load_events


def main():
    runs=[json.loads(p.read_text()) for p in sorted(E.glob('M15-SCN-0004-*/analysis.json'))]
    assert len(runs)==12
    for mode in ['baseline','trace']:
        for case in ['tap','hold']:
            assert len([r for r in runs if r['mode']==mode and r['case']==case])==3
    groups=collections.defaultdict(lambda:collections.defaultdict(lambda:{'counts':[],'rates':[],'interval_ms':[],'duration_ms':[]}))
    cpu=collections.defaultdict(list)
    sleep=collections.defaultdict(list)
    for r in runs:
        rd=E/r['run_id']; events=load_events(rd)
        exits={x['span_id']:x for x in events if x['phase']=='exit'}
        for label,w in r['windows'].items():
            group=f'{r["mode"]}/{label}/{r["case"]}'
            start,end=w['start_ns'],w['end_ns'];cpu[group].append(w['cpu_seconds'])
            for domain,d in w['domains'].items():
                g=groups[group][domain];g['counts'].append(d['N']);g['rates'].append(d['rate_hz'])
                if domain=='xdamage_receive':
                    damage=json.loads((rd/f'{label}-xdamage.json').read_text());times=[x['t_mono_ns'] for x in damage['events']]
                else:
                    c,m=DOMAINS[domain];rows=[x for x in events if x['phase']=='entry' and x['class']==c and x['method']==m and start<=x['t_mono_ns']<end]
                    times=[x['t_mono_ns'] for x in rows]
                    g['duration_ms'].extend((exits[x['span_id']]['t_mono_ns']-x['t_mono_ns'])/1e6 for x in rows if x['span_id'] in exits and exits[x['span_id']]['t_mono_ns']<end)
                g['interval_ms'].extend((b-a)/1e6 for a,b in zip(times,times[1:]))
            before={}
            for x in events:
                if not start<=x['t_mono_ns']<end or x['class']!='br' or x['method']!='b()V':continue
                if x['detail']=='before_Thread.sleep':before[x['span_id']]=x
                if x['detail']=='after_Thread.sleep' and x['span_id'] in before:
                    sleep[group].append((x['t_mono_ns']-before[x['span_id']]['t_mono_ns'])/1e6)
    aggregate={}
    for group,domains in groups.items():
        aggregate[group]={'cpu_seconds_per_window':stats(cpu[group]),'sleep_bracket_ms':stats(sleep[group]),'domains':{}}
        for domain,d in domains.items():
            aggregate[group]['domains'][domain]={'counts':d['counts'],'N':sum(d['counts']),'rate_hz_across_runs':stats(d['rates']),
                'interval_ms_pooled':stats(d['interval_ms']),'duration_ms_pooled':stats(d['duration_ms'])}
    overhead={}
    for label,case in [('menu','tap'),('gameplay','tap'),('gameplay','hold')]:
        bg=f'baseline/{label}/{case}';tg=f'trace/{label}/{case}'
        b=aggregate[bg];t=aggregate[tg];bd=b['domains']['xdamage_receive'];td=t['domains']['xdamage_receive']
        paired=[]
        for rep in ['01','02','03']:
            br=next(r for r in runs if r['mode']=='baseline' and r['case']==case and r['run_id'].endswith('R'+rep))
            tr=next(r for r in runs if r['mode']=='trace' and r['case']==case and r['run_id'].endswith('R'+rep))
            bv=br['windows'][label];tv=tr['windows'][label]
            paired.append({'repeat':rep,'damage_rate_delta_hz':tv['domains']['xdamage_receive']['rate_hz']-bv['domains']['xdamage_receive']['rate_hz'],
                'cpu_delta_seconds':tv['cpu_seconds']-bv['cpu_seconds'],
                'damage_interval_median_delta_ms':tv['domains']['xdamage_receive']['interval_ms']['median']-bv['domains']['xdamage_receive']['interval_ms']['median'],
                'damage_interval_p95_delta_ms':tv['domains']['xdamage_receive']['interval_ms']['p95']-bv['domains']['xdamage_receive']['interval_ms']['p95']})
        overhead[f'{label}/{case}']={'paired_differences':paired,'rate_delta_hz':stats([p['damage_rate_delta_hz'] for p in paired]),
            'interval_median_delta_ms':stats([p['damage_interval_median_delta_ms'] for p in paired]),
            'interval_p95_delta_ms':stats([p['damage_interval_p95_delta_ms'] for p in paired]),
            'cpu_delta_seconds':stats([p['cpu_delta_seconds'] for p in paired])}
    inputs={}
    for case in ['tap','hold']:
        selected=[r for r in runs if r['mode']=='trace' and r['case']==case]
        inputs[case]={'run_n':3,'deferred_release_count':sum(len(r['deferred_release_chains']) for r in selected),
            'press_to_original_release_ms':stats([x['callback_press_to_original_release_ms'] for r in selected for x in r['input54_summary']]),
            'press_to_next_m_i_ms':stats([x['press_to_next_m_i_ms'] for r in selected for x in r['input54_summary']]),
            'listener_hold_bounds_ms':[r['listener_hold_bounds_ms'] for r in selected]}
    result={'groups':aggregate,'overhead':overhead,'input':inputs,'valid_run_count':len(runs),
        'trace_event_total':sum(r.get('health',{}).get('events',0) for r in runs),
        'cf03_bci6_total':sum(r.get('cf03_bci6_returns',0) for r in runs),
        'cf03_reset_total':sum(r.get('cf03_nonzero_resets',0) for r in runs)}
    (E/'aggregate.json').write_text(json.dumps(result,indent=2)+'\n')
    lines=['# Số liệu đo SCN-0004','', 'Dẫn xuất từ log thật; n độc lập=3 mỗi nhóm, T=30 giây/lượt. Interval không nối qua biên run. Median/p95/max là ms; rate là median của 3 N/T; p95 nearest-rank. `—` là không có mẫu.','',
        '| Nhóm | Miền | N từng lượt | Rate median Hz | n interval | Median | p95 | Max |',
        '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |']
    def fmt(x):return '—' if x is None else f'{x:.3f}'
    for group,v in aggregate.items():
        for domain,d in v['domains'].items():
            if domain not in ['scheduler','repaint_request','paint','update','frontbuffer_flush','awt_paint_submission','xdamage_receive']:continue
            s=d['interval_ms_pooled'];lines.append(f'| {group} | {domain} | '+ '/'.join(map(str,d['counts']))+f' | {fmt(d["rate_hz_across_runs"]["median"])} | {s["n"]} | {fmt(s["median"])} | {fmt(s["p95"])} | {fmt(s["max"])} |')
    lines+=['','Duration **inclusive**, có chi phí probe; `ar.paint` gồm pacing. Chỉ tính span kết thúc trong cửa sổ.','',
        '| Nhóm trace | Miền | n duration | Median ms | p95 ms | Max ms |','| --- | --- | ---: | ---: | ---: | ---: |']
    for group,v in aggregate.items():
        if not group.startswith('trace/'):continue
        for domain in ['update','world_render','hud_render','paint','pacing']:
            s=v['domains'][domain]['duration_ms_pooled'];lines.append(f'| {group} | {domain} | {s["n"]} | {fmt(s["median"])} | {fmt(s["p95"])} | {fmt(s["max"])} |')
        s=v['sleep_bracket_ms'];lines.append(f'| {group} | before/after Thread.sleep | {s["n"]} | {fmt(s["median"])} | {fmt(s["p95"])} | {fmt(s["max"])} |')
    lines+=['','Overhead quan sát bên ngoài: XDamage và CPU JVM. Mỗi cặp là trace trừ baseline cùng repeat/case, chạy khác thời điểm; không suy causal overhead thuần hoặc internal cadence của baseline.','',
        '| Cửa sổ/case | Δ rate Hz median/p95 (n=3) | Δ interval median ms: median/p95 | Δ interval p95 ms: median/p95 | Δ CPU s: median/p95 |',
        '| --- | --- | --- | --- | --- |']
    for group,o in overhead.items():
        def pair(k):return fmt(o[k]['median'])+'/'+fmt(o[k]['p95'])
        lines.append(f'| {group} | {pair("rate_delta_hz")} | {pair("interval_median_delta_ms")} | {pair("interval_p95_delta_ms")} | {pair("cpu_delta_seconds")} |')
    lines+=['','Chi tiết N/T, duration, state/thread, CPU theo run: [analysis.json](analysis.json), [aggregate.json](aggregate.json). P95 của 3 chênh lệch trial là max. Proxy host chịu coalescence và tải host; không coi Δ âm là probe làm game nhanh hơn.','',
        '| Case trace | n tap/hold | Hold bracket listener từng lượt (ms) | Callback press→release median/p95 ms | Press→m.i kế tiếp median/p95 ms | Release replay trong q.i |',
        '| --- | ---: | --- | --- | --- | ---: |']
    for case,s in inputs.items():
        a=s['press_to_original_release_ms'];b=s['press_to_next_m_i_ms'];bounds='; '.join(fmt(v[0])+'–'+fmt(v[1]) for v in s['listener_hold_bounds_ms'])
        lines.append(f'| {case} | 3 | {bounds} | {fmt(a["median"])}/{fmt(a["p95"])} | {fmt(b["median"])}/{fmt(b["p95"])} | {s["deferred_release_count"]} |')
    lines+=['','Press→m.i chỉ là thời gian tới entry update kế tiếp, **không phải latency phản ứng gameplay hoặc frame hiển thị**. P95 input n=3 là max. Hold thực đọc từ listener bounds; callback game có thể xử lý cả press/release trong cùng batch sau khi cả hai đã được enqueue.','']
    (E/'metrics.md').write_text('\n'.join(lines))
    print('Wrote aggregate.json and metrics.md from twelve measured runs')


if __name__=='__main__':main()
