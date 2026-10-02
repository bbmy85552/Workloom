#!/usr/bin/env bash
# Isolated behavior checks. No real Docker, GitHub, SSH or deployment is contacted.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT
mkdir -p "$TEST_ROOT/bin"
cat > "$TEST_ROOT/bin/docker" <<'PY'
#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args=sys.argv[1:]; state=Path(os.environ['MOCK_STATE']); mode=os.environ.get('MOCK_MODE','legacy')
with (state/'calls.jsonl').open('a') as f: f.write(json.dumps(['docker']+args)+'\n')
old='old-container'; new='new-container'
volumes=[] if mode in ('fresh','lost') else ['oldproject_jianji-data','oldproject_jianji-uploads']
if mode=='ambiguous': volumes += ['other_jianji-data','other_jianji-uploads']
if mode=='partial': volumes = volumes[:1]
if mode=='mixed': volumes = ['teamA_jianji-data','teamB_jianji-uploads']
if args[:2]==['compose','version']: print('Docker Compose test'); sys.exit()
if args[0]=='compose':
    a=args[1:]
    if a[:1]==['-f']: a=a[2:]
    if a[:3]==['ps','-a','-q']:
        if mode not in ('fresh','lost','ambiguous','partial','mixed'): print(old)
        if mode=='migrated': print(new)
    elif a[:2]==['ps','-q']: print(new)
    elif a[0]=='build': sys.exit(1 if mode=='build-fail' else 0)
    elif a[0]=='up': sys.exit(1 if mode=='up-fail' else 0)
    elif a[0] in ('ps','logs','stop'): pass
    else: raise RuntimeError(args)
    sys.exit()
if args[:2]==['volume','ls']: print('\n'.join(volumes)); sys.exit()
if args[:2]==['volume','inspect']: sys.exit(0 if args[2] in volumes else 1)
if args[0]=='inspect':
    template=args[2]; item=args[3]
    if item in ('jianji',old) and mode not in ('fresh','lost','ambiguous','partial','mixed'): item=old
    elif item in ('workloom',new) and (mode=='migrated' or item==new): item=new
    else: sys.exit(1)
    if template=='{{.Id}}': print(item)
    elif template=='{{.Name}}': print('/jianji' if item==old else '/workloom')
    elif 'working_dir' in template: print(os.getcwd())
    elif '.Mounts' in template:
        suffix='data' if '"/app/data"' in template else 'uploads'
        print(('bind||/existing/'+suffix) if mode=='bind' else ('volume|oldproject_jianji-'+suffix+'|/var/lib/docker/volumes/existing'))
    elif template=='{{.State.Running}}': print('false' if mode=='migrated' and item==old else 'true')
    elif '.State.Health' in template: print('healthy')
    else: raise RuntimeError(template)
    sys.exit()
if args[0] in ('stop','start'): print(args[1]); sys.exit()
raise RuntimeError(args)
PY
cat > "$TEST_ROOT/bin/git" <<'PY'
#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args=sys.argv[1:]; state=Path(os.environ['MOCK_STATE'])
with (state/'calls.jsonl').open('a') as f: f.write(json.dumps(['git']+args)+'\n')
if args==['config','--get','remote.origin.url']: print((state/'origin').read_text().strip())
elif args[:3]==['remote','set-url','origin']: (state/'origin').write_text(args[3])
elif args==['branch','--show-current']: print('main')
elif args==['rev-parse','HEAD']: print('a'*40)
elif args[:1]==['describe']: print('v1.0.0')
elif args[:1] in (['fetch'],['pull']): pass
else: raise RuntimeError(args)
PY
chmod +x "$TEST_ROOT/bin/docker" "$TEST_ROOT/bin/git"
REAL_DOCKER="$(command -v docker || true)"
export REAL_DOCKER
export PATH="$TEST_ROOT/bin:$PATH"
export ROOT TEST_ROOT
python3 - <<'PY'
import json, os, shutil, subprocess
from pathlib import Path
root=Path(os.environ['ROOT']); tmp=Path(os.environ['TEST_ROOT'])

def scenario(mode, script='update.sh', extra=None, origin='https://github.com/staklab/jianji.git'):
    path=tmp/(mode+('-'+script.replace('.sh',''))); path.mkdir()
    for name in ['scripts','src','server','.git']: (path/name).mkdir()
    for file in ['deployment-compat.sh', 'update.sh', 'install.sh', 'runtime-compose.mjs']:
        shutil.copy(root/'scripts'/file, path/'scripts'/file)
    shutil.copy(root/'docker-compose.yml',path/'docker-compose.yml')
    (path/'package.json').write_text('{}')
    (path/'origin').write_text(origin)
    if mode != 'fresh': (path/'.env').write_text('APP_URL=https://workloom.example.com\nJWT_SECRET=preserve-this-secret\nSETUP_TOKEN=preserve-token\nJIANJI_CURRENT_COMMIT=old\nJIANJI_UPDATE_REPO=https://github.com/staklab/jianji.git\nJIANJI_UPDATE_CHECK_URL=https://api.github.com/repos/staklab/jianji/commits/main\nCOOKIE_NAME=jianji_session\n')
    env={k:v for k,v in os.environ.items() if not k.startswith(('WORKLOOM_','JIANJI_'))}
    env.update(MOCK_STATE=str(path),MOCK_MODE=mode)
    env.update(extra or {})
    args=['bash','scripts/'+script]+(['-y'] if script=='install.sh' else [])
    result=subprocess.run(args,cwd=path,env=env,capture_output=True,text=True,timeout=20)
    calls=[json.loads(l) for l in (path/'calls.jsonl').read_text().splitlines()]
    return path,result,calls

def command(calls,prefix): return [i for i,c in enumerate(calls) if c[:len(prefix)]==prefix]

p,r,c=scenario('legacy')
assert r.returncode==0, r.stdout+r.stderr
config=(p/'.env').read_text()
for item in ['WORKLOOM_VOLUMES_EXTERNAL=true','WORKLOOM_DATA_VOLUME=oldproject_jianji-data','WORKLOOM_UPLOADS_VOLUME=oldproject_jianji-uploads','JWT_SECRET=preserve-this-secret','WORKLOOM_UPDATE_REPO=https://github.com/bbmy85552/Workloom.git','WORKLOOM_UPDATE_CHECK_URL=https://api.github.com/repos/bbmy85552/Workloom/commits/main']:
    assert item in config,item
assert command(c,['git','remote','set-url'])[0] < command(c,['git','fetch'])[0]
assert ['git','pull','--ff-only','origin','main'] in c
assert command(c,['docker','compose','build'])[0] < command(c,['docker','stop'])[0] < command(c,['docker','compose','up'])[0]
assert not any('rm' in a or 'down' in a for a in c if a[0]=='docker')
backup=list((p/'.update-backups').glob('.env.*'))[0].read_text()
assert 'WORKLOOM_' not in backup
print('PASS legacy update: original secrets/config backup, exact volumes, origin before fetch, build before stop')

for mode in ['bind','ambiguous','partial','mixed','lost']:
    p,r,c=scenario(mode)
    assert r.returncode!=0,(mode,r.stdout,r.stderr)
    assert not command(c,['docker','compose','build']) and not command(c,['docker','stop']),mode
print('PASS uncertain storage: bind mounts, multiple candidates, missing paired volume, and different project prefixes and missing storage stop before deployment')

p,r,c=scenario('build-fail')
assert r.returncode!=0 and not command(c,['docker','stop'])
p,r,c=scenario('up-fail')
assert r.returncode!=0 and command(c,['docker','start','old-container'])
assert command(c,['docker','compose','stop','workloom'])[0] < command(c,['docker','start','old-container'])[0]
print('PASS build failure leaves old service running; startup failure restores retained container')

p,r,c=scenario('migrated')
assert r.returncode==0,r.stdout+r.stderr
assert not command(c,['docker','stop'])
print('PASS repeated upgrade tolerates the retained stopped predecessor')

p,r,c=scenario('fresh','install.sh')
assert r.returncode==0,r.stdout+r.stderr
assert 'WORKLOOM_DATA_VOLUME=workloom-data' in (p/'.env').read_text()
assert 'COOKIE_NAME=workloom_session' in (p/'.env').read_text()
assert 'WORKLOOM_VOLUMES_EXTERNAL=false' in (p/'.env').read_text()
assert not command(c,['docker','stop'])
print('PASS fresh installation uses Workloom defaults')

p,r,c=scenario('custom',origin='https://github.com/example/custom-fork.git',extra={'WORKLOOM_SKIP_SOURCE_REFRESH':'false'})
assert r.returncode==0,r.stdout+r.stderr
assert not command(c,['git','remote','set-url'])
print('PASS custom Git origin remains unchanged')

# Verify conversion of server-specific runtime config without real Docker.
source={'name':'oldproject','services':{'jianji':{'image':'jianji:runtime','container_name':'jianji','environment':{'JWT_SECRET':'keep$$DOLLAR_SECRET','JIANJI_UPDATE_REPO':'old'},'ports':[{'target':4000,'published':'4999'}],'networks':{'default':{}},'volumes':[{'type':'volume','source':'old-data','target':'/app/data'},{'type':'volume','source':'old-uploads','target':'/app/uploads'}]},'proxy':{'image':'caddy','depends_on':{'jianji':{'condition':'service_started'}}}},'volumes':{'old-data':{'name':'oldproject_jianji-data'},'old-uploads':{'name':'oldproject_jianji-uploads'}}}
infile=tmp/'runtime-input.json'; outfile=tmp/'runtime-output.json'; envfile=tmp/'runtime.env'
infile.write_text(json.dumps(source)); envfile.write_text('WORKLOOM_DATA_VOLUME=oldproject_jianji-data\nWORKLOOM_UPLOADS_VOLUME=oldproject_jianji-uploads\nWORKLOOM_UPDATE_REPO=https://github.com/bbmy85552/Workloom.git\nWORKLOOM_UPDATE_COMMAND=echo $LITERAL_COMMAND\n')
subprocess.run(['node',str(root/'scripts/runtime-compose.mjs'),str(infile),str(outfile),str(envfile)],check=True)
converted=json.loads(outfile.read_text()); app=converted['services']['workloom']
assert 'jianji' not in converted['services'] and app['image']=='workloom:runtime'
assert app['environment']['JWT_SECRET']=='keep$$DOLLAR_SECRET' and 'JIANJI_UPDATE_REPO' not in app['environment']
assert app['environment']['WORKLOOM_UPDATE_REPO']=='https://github.com/bbmy85552/Workloom.git'
assert app['environment']['WORKLOOM_UPDATE_COMMAND']=='echo $$LITERAL_COMMAND'
assert app['ports']==source['services']['jianji']['ports']
assert converted['volumes']['workloom-data']=={'name':'oldproject_jianji-data','external':True}
assert 'workloom' in converted['services']['proxy']['depends_on']
assert outfile.stat().st_mode & 0o077 == 0
print('PASS runtime conversion protects dollar literals and retains ports, storage and dependent services')

real_docker=os.environ.get('REAL_DOCKER')
if real_docker:
    # Docker Compose config is read-only and does not need or contact a daemon.
    source['networks']={'default':{}}
    infile.write_text(json.dumps(source))
    first=subprocess.run([real_docker,'compose','-f',str(infile),'config','--format','json'],capture_output=True,text=True,check=True)
    infile.write_text(first.stdout)
    subprocess.run(['node',str(root/'scripts/runtime-compose.mjs'),str(infile),str(outfile),str(envfile)],check=True)
    second=subprocess.run([real_docker,'compose','--project-directory',str(tmp),'-f',str(outfile),'config','--format','json'],capture_output=True,text=True,check=True)
    before=json.loads(first.stdout)['services']['jianji']['environment']
    after=json.loads(second.stdout)['services']['workloom']['environment']
    assert after['JWT_SECRET']==before['JWT_SECRET']
    assert after['WORKLOOM_UPDATE_COMMAND']=='echo $$LITERAL_COMMAND'
    print('PASS actual Compose config round-trip preserves existing and newly injected dollar literals')

push=(root/'scripts/push-update.sh').read_text()
function=push[push.index('shell_quote() {'):push.index('\nrsync ',push.index('shell_quote() {'))]
value="/opt/O'Reilly $(touch SHOULD_NOT_RUN)"
quoted=subprocess.run(['bash','-c',function+'\nshell_quote "$1"','test',value],capture_output=True,text=True,check=True).stdout
roundtrip=subprocess.run(['sh','-c','printf %s '+quoted],capture_output=True,text=True,check=True).stdout
assert roundtrip==value
assert not (Path.cwd()/'SHOULD_NOT_RUN').exists()
assert 'docker compose --project-directory "$PROJECT_DIR" -f "$COMPOSE_FILE"' in (root/'scripts/update-runtime.sh').read_text()
print('PASS remote shell quoting and fixed runtime Compose project directory')

# Apply the actual rsync exclusion arguments to a harmless local temporary tree.
import re
flags=re.findall(r"  (--(?:exclude|include)='[^']*')",push)
flags=[f.replace("'",'') for f in flags]
src=tmp/'sync-source'; dst=tmp/'sync-dest';src.mkdir();dst.mkdir()
for name in ['.env','.env.local','.env.production','.env.example','server/prisma/prisma/private.db','server/prisma/private.db-wal','server/private.sqlite','key.pem','private.key','docker-compose.runtime.yml','README.md']:
    file=src/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_text('fixture')
subprocess.run(['rsync','-a',*flags,str(src)+'/',str(dst)+'/'],check=True)
assert sorted(str(f.relative_to(dst)) for f in dst.rglob('*') if f.is_file())==['.env.example','README.md']
print('PASS source sync excludes runtime env files, nested databases, keys and server-owned runtime Compose')
PY
