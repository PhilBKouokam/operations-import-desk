import subprocess,os,signal,time,urllib.request,json
log=open('/tmp/odi-m5-demo-launch.txt','w')
p=subprocess.Popen(['bash','scripts/demo-native.sh'],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
try:
 deadline=time.time()+90
 while time.time()<deadline:
  if p.poll() is not None:raise RuntimeError('Demo launcher exited early')
  try:
   with urllib.request.urlopen('http://127.0.0.1:3000/health/ready',timeout=1) as r:assert r.status==200
   with urllib.request.urlopen('http://127.0.0.1:3001/health/ready',timeout=1) as r:assert r.status==200
   with urllib.request.urlopen('http://127.0.0.1:5173',timeout=1) as r:assert r.status==200;assert b'id="root"' in r.read()
   with urllib.request.urlopen('http://127.0.0.1:8081/realms/operations-import-desk/.well-known/openid-configuration',timeout=1) as r:assert json.load(r)['issuer']=='http://127.0.0.1:8081/realms/operations-import-desk'
   print('PASS: native demo launcher UI 200, API Mongo readiness 200, worker Mongo/Redis readiness 200, exact Keycloak discovery issuer.');break
  except (OSError,AssertionError):time.sleep(1)
 else:raise RuntimeError('Demo readiness timeout')
finally:
 os.killpg(p.pid,signal.SIGTERM)
 try:p.wait(timeout=15)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
 log.close()
