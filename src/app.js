const page = document.body.dataset.page;
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

if (page === "map") {
  const regions = {
    Italy: "From a sunlit Sicilian kitchen, where lemons, stories, and second helpings are always in season.",
    "Puerto Rico": "From San Juan, where the sofrito is fragrant, the rice is generous, and the neighbors are family.",
    Poland: "From Kraków, where a pot of golden soup has a place at every Friday table.",
    Ghana: "A new family story is waiting to be shared from Ghana.",
    India: "From Gujarat, where monsoon afternoons call for a warm cup of masala chai.",
    "South Korea": "From Seoul, where the family gathers to fold mandu and welcome the new year together."
  };
  const worldMap = document.querySelector(".world-map");
  const submittedRecipe = document.querySelector("#submitted-region-recipe");
  const mapMessage = document.querySelector("#map-submission-message");

  function selectRegion(pin) {
    document.querySelector(".map-pin.active")?.classList.remove("active");
    pin.classList.add("active");
    submittedRecipe.classList.add("hidden");
    const region = pin.dataset.region;
    document.querySelector("#region-title").textContent = region;
    document.querySelector("#region-copy").textContent = regions[region] || "";
    document.querySelectorAll("[data-region-card]").forEach((card) => {
      card.classList.toggle("hidden", card.dataset.regionCard !== region);
    });
    document.querySelector("#region-recipe").classList.toggle("hidden", region !== "Italy");
  }

  document.querySelectorAll(".map-pin").forEach((pin) => {
    pin.addEventListener("click", () => {
      selectRegion(pin);
    });
  });

  function selectGrandma(pin, grandma, recipes) {
    document.querySelector(".map-pin.active")?.classList.remove("active");
    pin.classList.add("active");
    document.querySelectorAll(".map-detail .region-recipe").forEach((card) => card.classList.add("hidden"));
    document.querySelector("#region-title").textContent = grandma.from || grandma.name;
    document.querySelector("#region-copy").textContent = grandma.description;
    submittedRecipe.replaceChildren();
    const name = document.createElement("strong");
    name.textContent = grandma.name;
    const detail = document.createElement("span");
    detail.textContent = grandma.from || "Grandma's profile";
    const content = document.createElement("div");
    content.append(name, detail);
    const profileLink = document.createElement("a");
    profileLink.href = grandma.url;
    profileLink.textContent = "View profile";
    submittedRecipe.append(content, profileLink);
    for (const recipe of recipes) {
      const recipeLink = document.createElement("a");
      recipeLink.href = recipe.url;
      recipeLink.textContent = recipe.title || "View recipe";
      submittedRecipe.append(recipeLink);
    }
    submittedRecipe.classList.remove("hidden");
  }

  async function loadSubmittedGrandmas() {
    const [grandmaResponse, recipeResponse] = await Promise.all([
      fetch("/api/grandmas"),
      fetch("/api/recipes")
    ]);
    const [grandmaData, recipeData] = await Promise.all([
      grandmaResponse.json(),
      recipeResponse.json()
    ]);
    if (!grandmaResponse.ok) throw new Error(grandmaData.error || "Grandma profiles couldn't be loaded.");
    if (!recipeResponse.ok) throw new Error(recipeData.error || "Recipe cards couldn't be loaded.");
    if (!Array.isArray(grandmaData.grandmas) || !Array.isArray(recipeData.recipes)) {
      throw new Error("The server returned invalid map data.");
    }

    const unplaced = [];
    const occupiedPositions = new Map();
    const placeCoordinateLookups = new Map();
    for (const grandma of grandmaData.grandmas) {
      let coordinates;
      if (Number.isFinite(grandma.latitude) && Number.isFinite(grandma.longitude)) {
        coordinates = { latitude: grandma.latitude, longitude: grandma.longitude };
      } else if (grandma.from) {
        const place = grandma.from.trim().toLowerCase();
        if (!placeCoordinateLookups.has(place)) {
          placeCoordinateLookups.set(place, findPlaceCoordinates(grandma.from));
        }
        try {
          coordinates = await placeCoordinateLookups.get(place);
        } catch {
          unplaced.push(grandma);
          continue;
        }
      }
      if (!coordinates) {
        unplaced.push(grandma);
        continue;
      }

      const associatedRecipes = recipeData.recipes.filter((recipe) =>
        recipe.grandmaId === grandma.id ||
        (!recipe.grandmaId && recipe.grandma?.toLowerCase() === grandma.name.toLowerCase())
      );
      const pin = document.createElement("button");
      let x = Math.max(3, Math.min(97, ((coordinates.longitude + 180) / 360) * 100));
      let y = Math.max(3, Math.min(97, ((90 - coordinates.latitude) / 180) * 100));
      const positionKey = `${x.toFixed(1)},${y.toFixed(1)}`;
      const overlap = occupiedPositions.get(positionKey) || 0;
      const offsets = [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]];
      const [offsetX, offsetY] = offsets[overlap % offsets.length];
      x = Math.max(3, Math.min(97, x + offsetX));
      y = Math.max(3, Math.min(97, y + offsetY));
      occupiedPositions.set(positionKey, overlap + 1);
      pin.type = "button";
      pin.className = "map-pin submitted-pin";
      pin.style.setProperty("--x", `${x}%`);
      pin.style.setProperty("--y", `${y}%`);
      pin.textContent = "✳";
      pin.setAttribute("aria-label", `Explore ${grandma.name} from ${grandma.from}`);
      pin.title = `${grandma.name} · ${grandma.from}`;
      pin.addEventListener("click", () => selectGrandma(pin, grandma, associatedRecipes));
      worldMap.append(pin);
    }

    if (unplaced.length) {
      mapMessage.replaceChildren(document.createTextNode("Some Grandma profiles couldn't be placed on the map: "));
      unplaced.forEach(({ name, url }, index) => {
        if (index) mapMessage.append(document.createTextNode(", "));
        const profileLink = document.createElement("a");
        profileLink.href = url;
        profileLink.textContent = name;
        mapMessage.append(profileLink);
      });
      mapMessage.append(document.createTextNode(". Check the location and try again."));
      mapMessage.hidden = false;
    }
  }

  loadSubmittedGrandmas().catch((error) => {
    console.error("Unable to load submitted Grandma profiles for the map.", error);
    mapMessage.textContent = error.message || "Grandma profiles couldn't be loaded from the server.";
    mapMessage.hidden = false;
  });
}
