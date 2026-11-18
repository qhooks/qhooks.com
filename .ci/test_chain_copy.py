"""Real checker public seam: numeric/capital/word modes and fail-closed catalog controls."""
import json,subprocess,tempfile,unittest
from pathlib import Path
CHECKER=Path(__file__).with_name('chain-copy-check.mjs').resolve()
class ChainCopyModes(unittest.TestCase):
 def check(self,markup,expected=True,ids=None,count=7):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp);live=[{'id':str(i)}for i in range(1,count+1)]
   (p/'chains.mjs').write_text('export const LIVE='+json.dumps(live)+';')
   (p/'qx-chain-count.mjs').write_text("export const CHAIN_COUNT=7,CHAIN_WORD='seven';")
   ids=ids or ['all','solana',*[str(i)for i in range(1,count+1)]]
   (p/'qx-terminal-feed-core.mjs').write_text('export const CHAINS = ['+','.join("['"+i+"','fixture']"for i in ids)+'];')
   (p/'hooks.html').write_text(markup)
   r=subprocess.run(['node',str(CHECKER),str(p)],capture_output=True,text=True,timeout=15)
   self.assertEqual(r.returncode==0,expected,r.stdout+r.stderr)
 def test_numeric_default_word_and_capital_supported(self):self.check('<b data-chain-count="num">7</b><b data-chain-count>seven</b><b data-chain-count="word">seven</b><b data-chain-count="cap">Seven</b>')
 def test_wrong_number_refused(self):self.check('<b data-chain-count="num">8</b>',False)
 def test_word_in_numeric_slot_refused(self):self.check('<b data-chain-count="num">seven</b>',False)
 def test_number_in_word_slot_refused(self):self.check('<b data-chain-count>7</b>',False)
 def test_wrong_capital_refused(self):self.check('<b data-chain-count="cap">seven</b>',False)
 def test_unknown_mode_refused_even_with_valid_word(self):self.check('<b data-chain-count="unknown">seven</b>',False)
 def test_wrong_feed_catalog_still_refused(self):self.check('<b data-chain-count="num">7</b>',False,ids=['all','solana','1','2','3','4','5','6','999'])
 def test_count_drift_still_refused(self):self.check('<b data-chain-count="num">7</b>',False,count=6)
if __name__=='__main__':unittest.main()
