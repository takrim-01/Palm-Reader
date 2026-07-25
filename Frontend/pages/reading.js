import { db,doc,getDoc } from "/firebase/firebase.js";


const params = new URLSearchParams(window.location.search);

const id = params.get("id");

if (!id) {

    document.body.innerHTML = "<h2>No Reading Found</h2>";

}

async function loadReading() {

    const docRef = doc(db, "palm-reading", id);

    const snap = await getDoc(docRef);

    if (!snap.exists()) {

        document.body.innerHTML = "<h2>Reading Not Found</h2>";

        return;

    }

    const data = snap.data();

    document.getElementById("personName").textContent = data.name;

    document.getElementById("personDob").textContent =
        "DOB : " + data.dob;

    document.getElementById("reading").innerHTML =
        data.reading.replace(/\n/g, "<br>");

    document.getElementById("capturePalm").src =
        data.image;
    document.getElementById("palmPhotoBlock").style.display = "block";

}

loadReading();