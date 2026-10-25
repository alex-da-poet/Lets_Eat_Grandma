const page = document.body.dataset.page;
const submissionStorageKey = "lets-eat-grandma.submissions";

function readGrandmaSubmissions() {
  const saved = localStorage.getItem(submissionStorageKey);
  if (!saved) return [];
  const submissions = JSON.parse(saved);
  if (!Array.isArray(submissions) || !submissions.every((submission) =>
    submission &&
    typeof submission.name === "string" &&
    typeof submission.origin === "string" &&
    typeof submission.category === "string" &&
    typeof submission.story === "string" &&
    Number.isFinite(submission.latitude) &&
    Number.isFinite(submission.longitude)
  )) {
    throw new Error("Saved grandma submissions have an invalid format.");
  }
  return submissions;
}

async function findPlaceCoordinates(place) {
  const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(place)}&limit=1`);
  if (!response.ok) throw new Error(`Place lookup failed with status ${response.status}.`);
  const result = await response.json();
  const coordinates = result.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
    return null;
  }
  return { longitude: coordinates[0], latitude: coordinates[1] };
}

document.querySelectorAll(".menu-toggle").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const nav = document.querySelector(".main-nav");
    const isOpen = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });
});

if (page === "home") {
  const cards = [...document.querySelectorAll(".recipe-card")];
  const recipeBox = document.querySelector("#family-recipe-box");
  const boxToggle = recipeBox.querySelector(".recipe-box-lid");
  const boxInterior = document.querySelector("#recipe-box-interior");
  boxToggle.addEventListener("click", () => {
    const isOpen = recipeBox.classList.toggle("is-open");
    recipeBox.classList.toggle("is-closed", !isOpen);
    boxToggle.setAttribute("aria-expanded", String(isOpen));
    boxInterior.setAttribute("aria-hidden", String(!isOpen));
    boxInterior.inert = !isOpen;
    boxToggle.querySelector(".recipe-box-action-label").textContent = isOpen
      ? "Close the recipe box"
      : "Open the recipe box";
    boxToggle.querySelector(".recipe-box-arrow").textContent = isOpen ? "↑" : "↓";
  });
  document.querySelectorAll(".card-flip").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".recipe-card");
      const flipped = card.classList.toggle("flipped");
      button.setAttribute("aria-pressed", String(flipped));
    });
  });
  document.querySelectorAll(".recipe-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelector(".recipe-tab.selected")?.classList.remove("selected");
      document.querySelector(".recipe-tab[aria-pressed='true']")?.setAttribute("aria-pressed", "false");
      tab.classList.add("selected");
      tab.setAttribute("aria-pressed", "true");
      cards.forEach((card) => {
        card.hidden = tab.dataset.filter !== "all" && card.dataset.category !== tab.dataset.filter;
      });
    });
  });
}

if (page === "submit") {
  const story = document.querySelector("#story");
  story.addEventListener("input", () => {
    document.querySelector("#story-count").textContent = String(story.value.length);
  });

  [["#portrait", "#portrait-preview"], ["#recipe-photo", "#recipe-preview"]].forEach(([inputSelector, previewSelector]) => {
    const input = document.querySelector(inputSelector);
    input.addEventListener("change", () => {
      const file = input.files[0];
      const preview = document.querySelector(previewSelector);
      if (!file) {
        preview.textContent = "Choose a photo";
        return;
      }
      if (!["image/jpeg"].includes(file.type)) {
        input.value = "";
        preview.textContent = "Please choose a JPG or JPEG photo";
        return;
      }
      const image = document.createElement("img");
      image.src = URL.createObjectURL(file);
      image.alt = `Preview of ${file.name}`;
      preview.replaceChildren(image, document.createTextNode(file.name));
    });
  });

  document.querySelector("#scale-recipe").addEventListener("click", () => {
    const recipe = document.querySelector("#recipe-text").value.trim();
    const result = document.querySelector("#scaled-result");
    const factor = Number(document.querySelector("#scale-factor").value);
    if (!recipe) {
      result.hidden = false;
      result.textContent = "Add a recipe above and I'll help scale the written amounts.";
      return;
    }
    const scaled = recipe.replace(/\b(\d+\/\d+|\d+(?:\.\d+)?)\b/g, (amount, _number, offset) => {
      if (/^\s*°?\s*[FC]\b/i.test(recipe.slice(offset + amount.length))) return amount;
      const value = amount.includes("/") ? amount.split("/").reduce((n, d) => Number(n) / Number(d)) : Number(amount);
      const adjusted = value * factor;
      return Number.isInteger(adjusted) ? String(adjusted) : String(Number(adjusted.toFixed(2)));
    });
    result.hidden = false;
    result.textContent = scaled;
  });

  document.querySelector("#grandma-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submitButton = form.querySelector('button[type="submit"]');
    const feedback = document.querySelector("#form-feedback");
    feedback.hidden = false;
    feedback.textContent = "Finding that place so we can add her to the map...";
    submitButton.disabled = true;
    try {
      const fields = new FormData(form);
      const name = fields.get("name").trim();
      const origin = fields.get("origin").trim();
      const coordinates = await findPlaceCoordinates(origin);
      if (!coordinates) {
        feedback.textContent = "We couldn't find that place. Try adding a town and country, then submit again.";
        return;
      }
      const submissions = readGrandmaSubmissions();
      submissions.push({
        name,
        origin,
        category: fields.get("category"),
        story: fields.get("story").trim(),
        ...coordinates
      });
      localStorage.setItem(submissionStorageKey, JSON.stringify(submissions));
      feedback.replaceChildren(
        document.createTextNode(`What a lovely story about ${name}. She's on the map! `)
      );
      const mapLink = document.createElement("a");
      mapLink.href = "map.html";
      mapLink.textContent = "See her pin →";
      feedback.append(mapLink);
      form.reset();
      document.querySelector("#story-count").textContent = "0";
      document.querySelectorAll(".upload-preview").forEach((preview) => {
        const addIcon = document.createElement("b");
        addIcon.textContent = "＋";
        preview.replaceChildren(document.createTextNode("Choose a photo "), addIcon);
      });
    } catch (error) {
      console.error("Unable to save grandma submission.", error);
      feedback.textContent = "We couldn't look up or save this submission. Please check your connection and browser storage, then try again.";
    } finally {
      submitButton.disabled = false;
    }
  });
}

if (page === "map") {
  const regions = {
    Italy: "From a sunlit Sicilian kitchen, where lemons, stories, and second helpings are always in season.",
    "Puerto Rico": "From San Juan, where the sofrito is fragrant, the rice is generous, and the neighbors are family.",
    Poland: "From Kraków, where a pot of golden soup has a place at every Friday table.",
    Ghana: "A new family story is waiting to be shared from Ghana.",
    India: "From Gujarat, where monsoon afternoons call for a warm cup of masala chai.",
    "South Korea": "From Seoul, where the family gathers to fold mandu and welcome the new year together."
  };
  document.querySelectorAll(".map-pin").forEach((pin) => {
    pin.addEventListener("click", () => {
      document.querySelector(".map-pin.active")?.classList.remove("active");
      pin.classList.add("active");
      document.querySelector("#submitted-region-recipe").classList.add("hidden");
      const region = pin.dataset.region;
      document.querySelector("#region-title").textContent = region;
      document.querySelector("#region-copy").textContent = regions[region];
      document.querySelectorAll("[data-region-card]").forEach((card) => {
        card.classList.toggle("hidden", card.dataset.regionCard !== region);
      });
      document.querySelector("#region-recipe").classList.toggle("hidden", region !== "Italy");
    });
  });

  const worldMap = document.querySelector(".world-map");
  const submittedRecipe = document.querySelector("#submitted-region-recipe");
  const mapMessage = document.querySelector("#map-submission-message");
  try {
    readGrandmaSubmissions().forEach((submission) => {
      const pin = document.createElement("button");
      const x = Math.max(3, Math.min(97, ((submission.longitude + 180) / 360) * 100));
      const y = Math.max(3, Math.min(97, ((90 - submission.latitude) / 180) * 100));
      pin.type = "button";
      pin.className = "map-pin submitted-pin";
      pin.style.setProperty("--x", `${x}%`);
      pin.style.setProperty("--y", `${y}%`);
      pin.textContent = "✳";
      pin.setAttribute("aria-label", `Explore ${submission.name} from ${submission.origin}`);
      pin.title = `${submission.name} · ${submission.origin}`;
      pin.addEventListener("click", () => {
        document.querySelector(".map-pin.active")?.classList.remove("active");
        pin.classList.add("active");
        document.querySelectorAll(".map-detail .region-recipe").forEach((card) => card.classList.add("hidden"));
        document.querySelector("#region-title").textContent = submission.origin;
        document.querySelector("#region-copy").textContent = submission.story;
        document.querySelector("#submitted-grandma-name").textContent = submission.name;
        document.querySelector("#submitted-grandma-category").textContent = `${submission.category.replaceAll("-", " ")} family recipe`;
        submittedRecipe.classList.remove("hidden");
      });
      worldMap.append(pin);
    });
  } catch (error) {
    console.error("Unable to read saved grandma submissions.", error);
    mapMessage.textContent = "Saved grandma pins couldn't be loaded from this browser.";
    mapMessage.hidden = false;
  }
}
