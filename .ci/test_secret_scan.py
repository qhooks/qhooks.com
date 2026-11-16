import unittest,tempfile,subprocess,sys,json
from pathlib import Path
class SecretGuard(unittest.TestCase):
 def scan(self,value):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t);subprocess.run(['git','init','-q',t],check=True);(p/'fixture.txt').write_text(value);subprocess.run(['git','-C',t,'add','fixture.txt'],check=True)
   r=subprocess.run([sys.executable,str(Path(__file__).with_name('secret-scan.py')),t],capture_output=True,text=True);return r,json.loads(r.stdout)
 def test_public_address_passes(self):
  r,j=self.scan('public address 0x'+'1'*40);self.assertEqual(r.returncode,0);self.assertEqual(j['hits'],[])
 def test_private_key_marker_rejected_without_value(self):
  value='-----BEGIN '+'PRIVATE KEY-----\nfixture-only';r,j=self.scan(value);self.assertEqual(r.returncode,1);self.assertEqual(j['hits'],[{'path':'fixture.txt','rule':'private-key'}]);self.assertNotIn(value,r.stdout)
if __name__=='__main__':unittest.main()
