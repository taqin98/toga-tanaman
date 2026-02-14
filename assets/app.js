const API_URL = "https://script.googleusercontent.com/macros/echo?user_content_key=AehSKLhLNODnryZaROotw9GdP-pf-FdGHb1vXFKYrIJU0pZ32bLfAkJuR1jUbwhHvToU2oFnT3BlX-HJaR_GoTrSxcSdWWonPrza16jsDBQCQRuL4rvVHzepdEocKgZrizZGJgbLSZUT4HDI1zhibl_Z6M0h9MV3A8zjG7PnQYb5_Rg3HdE4su2cu4-6GRmXNM4aQQfAbm6V1DPPg2QYie2kDYgSdcUjhsDqUnBhW1Kq3uQOCVjacUSs_FrKgfHivHRNo-QkuuocaV8-CF6rggvD5gepb54GLz5VYN5NC0bEBzZkKvlMs5c&lib=MySi8iqgDJHi9tGKi8o9MMQy-BUcvC6lV";

const $ = (id) => document.getElementById(id);

function getParam(name){
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error("Fetch gagal");
  return await res.json();
}

function setList(el, items){
  el.innerHTML = "";
  (items || []).forEach(t => {
    const li = document.createElement("li");
    li.textContent = t;
    el.appendChild(li);
  });
}

function show(id){
  ["stateLoading","stateError","stateList","stateDetail"].forEach(x => $(x).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function makeListCard(item){
  const a = document.createElement("a");
  a.href = `./?id=${encodeURIComponent(item.id)}`;
  a.className = "card item";
  a.innerHTML = `
    <img class="thumb" src="${item.gambar || ""}" alt="Foto ${item.nama || ""}">
    <div>
      <h4>${item.nama || "-"}</h4>
      <div class="meta">${item.jenis || ""} • ${item.nama_latin || ""}</div>
    </div>
  `;
  return a;
}

async function main(){
  show("stateLoading");

  try{
    const id = getParam("id");

    // LIST
    if(!id){
      const list = await fetchJSON(`${API_URL}?mode=list`);
      $("listWrap").innerHTML = "";
      list.forEach(item => $("listWrap").appendChild(makeListCard(item)));
      show("stateList");
      return;
    }

    // DETAIL
    const plant = await fetchJSON(`${API_URL}?id=${encodeURIComponent(id)}`);

    $("img").src = plant.gambar || "";
    $("nama").textContent = plant.nama || "-";
    $("latin").textContent = plant.nama_latin ? `Nama latin: ${plant.nama_latin}` : "";
    $("chipJenis").textContent = plant.jenis || "TOGA";

    setList($("manfaat"), plant.manfaat);
    setList($("cara"), plant.cara_pakai);
    setList($("catatan"), plant.catatan);

    $("btnShare").onclick = async () => {
      const url = window.location.href;
      const text = `Info TOGA: ${plant.nama} (RT 09)`;
      if(navigator.share){
        try{ await navigator.share({ title: plant.nama, text, url }); }catch(_){}
      }else{
        await navigator.clipboard.writeText(url);
        alert("Link sudah disalin.");
      }
    };

    show("stateDetail");
  }catch(err){
    console.error(err);
    show("stateError");
  }
}

main();
