const DB_NAME = "capi-db";
const DB_VERSION = 1;

let dbPromise;

function requestToPromise(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
function txDone(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error || new Error("Transaction annulée"));
  });
}

export function uid(prefix="id"){
  if(globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains("transactions")){
        const s=db.createObjectStore("transactions",{keyPath:"id"});
        s.createIndex("date","date",{unique:false});
        s.createIndex("type","type",{unique:false});
        s.createIndex("categoryId","categoryId",{unique:false});
      }
      if(!db.objectStoreNames.contains("categories")){
        const s=db.createObjectStore("categories",{keyPath:"id"});
        s.createIndex("type","type",{unique:false});
      }
      if(!db.objectStoreNames.contains("subcategories")){
        const s=db.createObjectStore("subcategories",{keyPath:"id"});
        s.createIndex("categoryId","categoryId",{unique:false});
      }
      if(!db.objectStoreNames.contains("settings")){
        db.createObjectStore("settings",{keyPath:"key"});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}

export async function getAll(store){
  const db=await openDB();
  return requestToPromise(db.transaction(store,"readonly").objectStore(store).getAll());
}
export async function getOne(store,key){
  const db=await openDB();
  return requestToPromise(db.transaction(store,"readonly").objectStore(store).get(key));
}
export async function putOne(store,value){
  const db=await openDB();
  const tx=db.transaction(store,"readwrite");
  tx.objectStore(store).put(value);
  await txDone(tx);
  return value;
}
export async function deleteOne(store,key){
  const db=await openDB();
  const tx=db.transaction(store,"readwrite");
  tx.objectStore(store).delete(key);
  await txDone(tx);
}
export async function clearStore(store){
  const db=await openDB();
  const tx=db.transaction(store,"readwrite");
  tx.objectStore(store).clear();
  await txDone(tx);
}
export async function getSetting(key,fallback=null){
  const row=await getOne("settings",key);
  return row ? row.value : fallback;
}
export async function setSetting(key,value){
  return putOne("settings",{key,value});
}

export async function seedDefaults(){
  const seeded=await getSetting("seeded",false);
  if(seeded) return;

  const expense = [
    ["Logement", ["Loyer"]],
    ["Alimentation", ["Courses","Cantine au travail"]],
    ["Transport", ["Essence","Entretien & réparations","Parking & péages","Transports en commun"]],
    ["Abonnements", ["Téléphone","Netflix","Spotify","ChatGPT","Autre abonnement"]],
    ["Finances & protections", ["Crédits","Assurances","Frais bancaires"]],
    ["Santé & soins", ["Santé","Hygiène & soins personnels"]],
    ["Loisirs & sorties", ["Restaurants","Sorties loisirs","Cigarettes"]],
    ["Achats personnels", ["Vêtements","Électronique","Maison & bricolage"]],
    ["Voyages", ["Transport voyage","Hébergement","Activités"]],
    ["Cadeaux", []],
    ["Animaux", []],
    ["Sport", []],
    ["Autre", []]
  ];
  const income = [
    ["Salaire",[]],
    ["Prime",[]],
    ["Vente",[]],
    ["Remboursement",[]],
    ["Cadeau reçu",[]],
    ["Revenu annexe",[]],
    ["Autre revenu",[]]
  ];

  const db=await openDB();
  const tx=db.transaction(["categories","subcategories"],"readwrite");
  const catStore=tx.objectStore("categories");
  const subStore=tx.objectStore("subcategories");
  const now=new Date().toISOString();

  for(const [name,subs] of expense){
    const catId=uid("cat");
    catStore.put({id:catId,type:"expense",name,favorite:["Alimentation","Transport"].includes(name),archived:false,createdAt:now});
    for(const subName of subs){
      subStore.put({
        id:uid("sub"),categoryId:catId,name:subName,
        favorite:["Courses","Cantine au travail","Essence"].includes(subName),
        archived:false,createdAt:now
      });
    }
  }
  for(const [name,subs] of income){
    const catId=uid("cat");
    catStore.put({id:catId,type:"income",name,favorite:name==="Salaire",archived:false,createdAt:now});
    for(const subName of subs){
      subStore.put({id:uid("sub"),categoryId:catId,name:subName,favorite:false,archived:false,createdAt:now});
    }
  }
  await txDone(tx);
  await setSetting("profile",{firstName:"",lastName:"",email:"",cycleDay:25});
  await setSetting("fx_chf_eur",null);
  await setSetting("seeded",true);
}

export async function exportAllData(){
  return {
    format:"capi-backup",
    version:1,
    exportedAt:new Date().toISOString(),
    categories:await getAll("categories"),
    subcategories:await getAll("subcategories"),
    transactions:await getAll("transactions"),
    settings:await getAll("settings")
  };
}

export async function restoreAllData(payload){
  if(!payload || payload.format!=="capi-backup" || !Array.isArray(payload.transactions)){
    throw new Error("Sauvegarde non reconnue");
  }
  const db=await openDB();
  const stores=["categories","subcategories","transactions","settings"];
  const tx=db.transaction(stores,"readwrite");
  for(const s of stores) tx.objectStore(s).clear();
  for(const row of payload.categories || []) tx.objectStore("categories").put(row);
  for(const row of payload.subcategories || []) tx.objectStore("subcategories").put(row);
  for(const row of payload.transactions || []) tx.objectStore("transactions").put(row);
  for(const row of payload.settings || []) tx.objectStore("settings").put(row);
  await txDone(tx);
}
