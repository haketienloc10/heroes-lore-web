"""Verify archive identity, unchanged members, current source hashes and web files.

No runtime claims. All expected differences must be explicitly targeted classes.
"""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parents[2]
E=ROOT/'reverse-engineering/findings/evidence/milestone-1.5/scheduler-20261021'
BUILD=ROOT/'reference/recordings/scheduler-probe-v3'


def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    files=json.loads((E/'build-manifest.json').read_text())
    checks=[]
    for f in files:
        p=Path(f['path']);checks.append({'path':str(p),'size_ok':p.stat().st_size==f['size'],'hash_ok':digest(p)==f['sha256']})
    archives=[]
    for source,target,expected in [
        (ROOT/'original/heroes-lore-v2.1.2.jar',BUILD/'game-traced.jar',{'ad.class','ar.class','bf.class','br.class','bt.class','m.class','q.class'}),
        (Path('/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar'),BUILD/'emulator-traced.jar',{'javax/microedition/lcdui/Canvas.class','javax/microedition/lcdui/Display.class','org/recompile/mobile/MobilePlatform.class','org/recompile/freej2me/FreeJ2ME$LCD.class'})]:
        with zipfile.ZipFile(source) as a,zipfile.ZipFile(target) as b:
            assert a.namelist()==b.namelist()
            changed=[p for p in a.namelist() if a.read(p)!=b.read(p)]
            assert set(changed)==expected
            archives.append({'original':str(source),'copy':str(target),'member_count':len(a.namelist()),'changed_members':changed,'all_other_member_bytes_equal':True})
    original=json.loads((E/'environment.json').read_text())['web_files']
    now=[p for p in (ROOT/'web').rglob('*') if p.is_file() and 'node_modules' not in p.parts and 'dist' not in p.parts]
    web_ok={str(p.relative_to(ROOT)):digest(p) for p in now}=={x['path']:x['sha256'] for x in original}
    assert all(x['size_ok'] and x['hash_ok'] for x in checks) and web_ok
    result={'producer':'Python hashlib/zipfile, static verification only','files':checks,'archives':archives,'web_unchanged':web_ok,'web_file_count':len(original)}
    (E/'copy-verification.json').write_text(json.dumps(result,indent=2)+'\n')
    print('Verified original/copy identities, unchanged resources, web files:',len(original))


if __name__=='__main__':main()
