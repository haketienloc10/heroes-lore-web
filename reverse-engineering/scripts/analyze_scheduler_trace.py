"""Derived statistics only. Reads retained runtime files, never synthesizes events."""
import collections
import gzip
import json
import math
import re
from pathlib import Path
import statistics
import sys

ROOT = Path(__file__).resolve().parents[2]
E = ROOT/'reverse-engineering/findings/evidence/milestone-1.5/scheduler-20261021'
DOMAINS = {
    'scheduler': ('br', 'run()V'), 'release_drain': ('q', 'i()V'), 'repaint_trigger': ('q', 'j()V'),
    'repaint_request': ('javax/microedition/lcdui/Canvas', 'repaint()V'),
    'paint': ('ar', 'paint(Ljavax/microedition/lcdui/Graphics;)V'),
    'transition': ('m', 'e()V'), 'offset_update': ('m', 'g()V'), 'update': ('m', 'i()V'),
    'world_render': ('ad', 'a(Ljavax/microedition/lcdui/Graphics;)V'),
    'hud_render': ('ar', 'a(Ljavax/microedition/lcdui/Graphics;)V'), 'pacing': ('br', 'b()V'),
    'frontbuffer_flush': ('org/recompile/mobile/MobilePlatform', 'flushGraphics(Lorg/recompile/mobile/PlatformImage;IIII)V'),
    'awt_paint_submission': ('org/recompile/freej2me/FreeJ2ME$LCD', 'paint(Ljava/awt/Graphics;)V'),
}


def stats(values):
    if not values: return {'n': 0, 'median': None, 'p95': None, 'max': None}
    v = sorted(values)
    return {'n': len(v), 'median': statistics.median(v), 'p95': v[math.ceil(.95*len(v))-1], 'max': v[-1]}


def intervals(times): return stats([(b-a)/1e6 for a,b in zip(times,times[1:])])


def load_events(rd):
    candidates=[rd/'trace.jsonl',ROOT/'reference/recordings'/rd.name/'trace.jsonl']
    for path in candidates:
        if path.exists():return [json.loads(line) for line in path.read_text().splitlines()]
    compressed=ROOT/'reference/recordings'/rd.name/'trace.jsonl.gz'
    if compressed.exists():
        with gzip.open(compressed,'rt') as f:return [json.loads(line) for line in f]
    return []


def analyze(rd):
    launch = json.loads((rd/'launch.json').read_text())
    result = {'run_id': rd.name, 'mode': launch['mode'], 'case': launch['case'], 'windows': {}}
    events = load_events(rd)
    entries = {x['span_id']:x for x in events if x['phase']=='entry'}
    exits = {x['span_id']:x for x in events if x['phase']=='exit'}
    by_span = collections.defaultdict(list)
    for x in events: by_span[x['span_id']].append(x)
    if (rd/'sequence-input.log').exists():
        dispatch=[]
        for line in (rd/'sequence-input.log').read_text().splitlines():
            match=re.search(r'mono_ns=(\d+) listener_dispatch_(begin|end) phase=(down|up) code=(\d+)',line)
            if match: dispatch.append({'t_mono_ns':int(match[1]),'edge':match[2],'phase':match[3],'code':int(match[4])})
        result['listener_dispatch']=dispatch
        down=[x for x in dispatch if x['phase']=='down'];up=[x for x in dispatch if x['phase']=='up']
        if len(down)==2 and len(up)==2:
            result['listener_hold_bounds_ms']=[(up[0]['t_mono_ns']-down[1]['t_mono_ns'])/1e6,(up[1]['t_mono_ns']-down[0]['t_mono_ns'])/1e6]
    for path in sorted(rd.glob('*-xdamage.json')):
        damage = json.loads(path.read_text()); start,end = damage['start_ns'],damage['end_ns']; label=path.name.removesuffix('-xdamage.json')
        win = result['windows'][label] = {'start_ns':start,'end_ns':end,'seconds':(end-start)/1e9,'domains':{}}
        times = [x['t_mono_ns'] for x in damage['events']]
        win['domains']['xdamage_receive'] = {'N':len(times),'rate_hz':len(times)/win['seconds'],'interval_ms':intervals(times)}
        process = json.loads((rd/f'{label}-process.json').read_text())
        before,after = process['before'],process['after']; ticks=after['utime_ticks']+after['stime_ticks']-before['utime_ticks']-before['stime_ticks']
        win['cpu_seconds'] = ticks/before['clock_ticks_per_second']
        for domain,(c,m) in DOMAINS.items():
            rows=[x for x in events if x['class']==c and x['method']==m and x['phase']=='entry' and start<=x['t_mono_ns']<end]
            if not events: continue
            times=[x['t_mono_ns'] for x in rows]
            durations=[(exits[x['span_id']]['t_mono_ns']-x['t_mono_ns'])/1e6 for x in rows if x['span_id'] in exits and exits[x['span_id']]['t_mono_ns']<end]
            win['domains'][domain]={'N':len(rows),'rate_hz':len(rows)/win['seconds'],'interval_ms':intervals(times),'duration_ms':stats(durations),
                'states':dict(collections.Counter(str(x['m.e:I']) for x in rows)),
                'period_ms':dict(collections.Counter(str(x['br.d:I']) for x in rows)),
                'threads':dict(collections.Counter(f'{x["thread_id"]}:{x["thread_name"]}' for x in rows))}
        if events:
            samples=[x for x in events if start<=x['t_mono_ns']<end and x['detail']=='before_Thread.sleep']
            win['sleep_calls']=len(samples)
    if events:
        result['health'] = json.loads((rd/'trace-health.json').read_text())
        result['sequence_contiguous']=all(x['seq']==i+1 for i,x in enumerate(events))
        result['monotonic_non_decreasing']=all(a['t_mono_ns']<=b['t_mono_ns'] for a,b in zip(events,events[1:]))
        result['unclosed_entry_ids']=[i for i in entries if i not in exits]
        result['exit_without_entry']=[i for i in exits if i not in entries]
        result['br_run_threads']=dict(collections.Counter(f'{x["thread_id"]}:{x["thread_name"]}' for x in events if x['class']=='br' and x['method']=='run()V' and x['phase']=='entry'))
        result['serial_correlations']=sum(x['serial_enqueue_id']!=0 for x in events)
        result['cf03_bci6_returns']=sum(x['detail']=='original_bci6' for x in events)
        result['cf03_nonzero_resets']=sum(x['detail']=='after_reset_m.b:B_original_bci12' for x in events)
        result['cf03_empty_examples']=[]
        result['cf03_bad_spans']=[]
        for x in events:
            if x['detail']!='original_bci6': continue
            span=by_span[x['span_id']]
            if any(y['detail']=='after_reset_m.b:B_original_bci12' for y in span): result['cf03_bad_spans'].append(x['span_id'])
            if len(result['cf03_empty_examples'])<2: result['cf03_empty_examples'].append(span)
        # Parent spans establish synchronous nesting only; serial correlation separate.
        result['ordering']=collections.Counter()
        children=collections.defaultdict(list)
        for x in events:
            if x['phase']=='entry': children[x['parent_span_id']].append(x)
        for x in entries.values():
            cs=children[x['span_id']]
            names=[y['class']+'.'+y['method'] for y in cs]
            if x['class']=='br' and x['method']=='run()V':
                relevant=[n for n in names if n in ['q.i()V','q.j()V','javax/microedition/lcdui/Display.callSerially(Ljava/lang/Runnable;)V']]
                result['ordering']['br:'+','.join(relevant)]+=1
            if x['class']=='ar' and x['method'].startswith('paint('):
                result['ordering']['ar:'+','.join(names)]+=1
        result['input_events']=[x for x in events if x['class']=='ar' and x['method'] in ('keyPressed(I)V','keyReleased(I)V')]
        result['deferred_release_chains']=[]
        for x in events:
            if x['class']!='ar' or x['method']!='keyReleased(I)V' or x['phase']!='entry':continue
            parent=entries.get(x['parent_span_id'])
            if parent and parent['class']=='q' and parent['method']=='i()V':
                drain=by_span[parent['span_id']]
                result['deferred_release_chains'].append({'drain':drain,'replayed_release':by_span[x['span_id']],
                    'nested_m_h': [y for y in children[x['span_id']] if y['class']=='m' and y['method']=='h()V']})
        result['input54_press_entries']=[x for x in events if x['class']=='ar' and x['method']=='keyPressed(I)V' and x['phase']=='entry' and x['arg0_int']==54]
        result['input54_release_entries']=[x for x in events if x['class']=='ar' and x['method']=='keyReleased(I)V' and x['phase']=='entry' and x['arg0_int']==54]
        result['method_entry_totals']={c+'.'+m:n for (c,m),n in collections.Counter((x['class'],x['method']) for x in events if x['phase']=='entry').items()}
        result['input54_summary']=[]
        for press in result['input54_press_entries']:
            updates=[x for x in events if x['class']=='m' and x['method']=='i()V' and x['phase']=='entry' and x['t_mono_ns']>=press['t_mono_ns']]
            releases=[x for x in result['input54_release_entries'] if x['t_mono_ns']>=press['t_mono_ns'] and x['parent_span_id']==0]
            next_update=updates[0] if updates else None
            release=releases[0] if releases else None
            result['input54_summary'].append({'press_seq':press['seq'],'release_seq':release['seq'] if release else None,
                'callback_press_to_original_release_ms':(release['t_mono_ns']-press['t_mono_ns'])/1e6 if release else None,
                'press_to_next_m_i_ms':(next_update['t_mono_ns']-press['t_mono_ns'])/1e6 if next_update else None,
                'next_m_i_seq':next_update['seq'] if next_update else None,
                'action_calls_inside_press':[y for y in children[press['span_id']] if y['class']=='m' and y['method']=='b(B)V'],
                'latency_is_structural_not_visible_response':True})
        result['state_samples']=dict(collections.Counter(str(x['m.e:I']) for x in events if x['class']=='m' and x['method']=='e()V' and x['phase']=='entry'))
        result['pending_nonzero_samples']=[x for x in events if x['class']=='m' and x['method']=='e()V' and x['phase']=='entry' and x['m.b:B'] not in (0,None)]
        # Successful return inside m.e identifies the concrete path, not a debugger stepping stream.
        result['pacing_points']=dict(collections.Counter(x['detail'] for x in events if x['class']=='br' and x['method']=='b()V' and x['phase']=='point'))
    return result


def main():
    results=[]
    for rd in sorted(E.glob('M15-SCN-0004-*')):
        if not (rd/'stop.json').exists(): continue
        result=analyze(rd); (rd/'analysis.json').write_text(json.dumps(result,indent=2)+'\n');results.append(result)
        if result.get('deferred_release_chains'):
            events=load_events(rd)
            first=min(x['seq'] for x in result['input54_press_entries'])
            last=max(x['seq'] for chain in result['deferred_release_chains'] for x in chain['drain'])
            selected=[x for x in events if first<=x['seq']<=last]
            (rd/'deferred-release-excerpt.jsonl').write_text(''.join(json.dumps(x)+'\n' for x in selected))
    summary={'producer':'Phân tích dẫn xuất từ trace và XDamage; p95 nearest-rank, median chuẩn', 'runs':results}
    (E/'analysis.json').write_text(json.dumps(summary,indent=2)+'\n')
    for r in results:
        print(r['run_id'], {w:{d: (v['N'],round(v['rate_hz'],3),v['interval_ms']['median']) for d,v in data['domains'].items() if d in ['scheduler','paint','update','xdamage_receive','awt_paint_submission']} for w,data in r['windows'].items()},'deferred',len(r.get('deferred_release_chains',[])))


if __name__=='__main__': main()
