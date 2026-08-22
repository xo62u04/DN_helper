# 改完 shared.js / lineup.js / style.css 後跑這支，更新所有頁面的版本號，
# 讓大家的瀏覽器抓到新檔而不是舊快取。   用法: python bump.py
import io, re, datetime
V = datetime.datetime.now().strftime('%Y%m%d%H%M')
for f in ['index.html', 'raid.html', 'roster.html', 'board.html']:
    s = io.open(f, encoding='utf-8').read()
    s = re.sub(r'href="style\.css(\?v=[0-9]+)?"', 'href="style.css?v=%s"' % V, s)
    s = re.sub(r'src="shared\.js(\?v=[0-9]+)?"',  'src="shared.js?v=%s"' % V,  s)
    s = re.sub(r'src="lineup\.js(\?v=[0-9]+)?"',  'src="lineup.js?v=%s"' % V,  s)
    io.open(f, 'w', encoding='utf-8').write(s)
print('版本號更新為', V)
