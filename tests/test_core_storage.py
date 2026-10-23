import os, requests, uuid
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
BASE=(os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
URL=BASE.rstrip('/')+"/objstore/api/v1/storage"
r=requests.post(f"{URL}/init",json={"emergent_key":os.environ["EMERGENT_LLM_KEY"]},timeout=30); r.raise_for_status()
key=r.json()["storage_key"]
data=b"hello olabs "+uuid.uuid4().bytes
path=f"olabs/poc/{uuid.uuid4()}.txt"
p=requests.put(f"{URL}/objects/{path}",headers={"X-Storage-Key":key,"Content-Type":"text/plain"},data=data,timeout=60); p.raise_for_status()
res=p.json(); print("PUT",res)
g=requests.get(f"{URL}/objects/{res['path']}",headers={"X-Storage-Key":key},timeout=60); g.raise_for_status()
assert g.content==data, "mismatch"
print("GET OK, integrity verified", g.headers.get("Content-Type"))
