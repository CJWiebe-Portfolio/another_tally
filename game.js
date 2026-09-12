// --- Survivor's Journal: game state + UI wiring ---
//
// index.html's inline Firebase script owns sign-in/out and Firestore, and
// exposes two globals for this file to use:
//   window.saveGameState(uid, state)  -> writes state to Firestore
//   window.getCurrentUser()           -> the signed-in Firebase user, or null
//
// This file owns everything else: the actual game state, drawing it into
// the HUD, and what the four action buttons do. It also defines the two
// globals the Firebase script calls back into after sign-in:
//   window.applyGameState(state) -> load a saved state into the UI
//   window.startNewGame()        -> seed a fresh state for a new player

(function () {
  "use strict";

  const RESOURCE_IDS = {
    food: "food-marks",
    water: "water-marks",
    bandages: "bandages-marks",
    materials: "materials-marks",
    shells: "shells-marks",
  };

  const DAY_WORDS = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
    "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty",
  ];

  // The pre-written "Day Eleven" scenario from the original mockup. Used
  // both as the look of the page before anyone signs in, and as the seed
  // for a brand-new save. Change this if a new game should instead start
  // on day one.
  function defaultState() {
    return {
      day: 11,
      resources: { food: 6, water: 3, bandages: 2, materials: 9, shells: 1 },
      roster: [
        { id: "marquez", name: "Marquez", note: "gone scavenging", critical: false },
        { id: "okafor", name: "Okafor", note: "asleep, finally", critical: false },
        { id: "reyes", name: "Reyes", note: "fever's worse", critical: true, restCount: 0 },
      ],
      diary: [
        { time: "9:40pm", text: "Heard them at the fence again. Moss says the west wall won't take another night like the last one." },
        { time: "7:15pm", text: "Marquez brought back tinned peaches and a working radio. No signal yet. Still — a radio." },
        { time: "4:00pm", text: "Reyes won't eat. Told her it's the fever talking. I don't think either of us believed it." },
        { time: "Dawn", text: "Eleven days. Somehow that number feels bigger than the ones before it." },
      ],
    };
  }

  let gameState = defaultState();

  function $(id) {
    return document.getElementById(id);
  }

  // Turns a count into the page's "|||| ||" tally-mark style, in groups of 4.
  function tally(n) {
    if (!n || n <= 0) return "";
    const groups = [];
    let remaining = n;
    while (remaining > 0) {
      const take = Math.min(4, remaining);
      groups.push("|".repeat(take));
      remaining -= take;
    }
    return groups.join(" ");
  }

  function dayLabel(n) {
    return DAY_WORDS[n] || String(n);
  }

  function timestamp() {
    const d = new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return `${h}:${m}${ampm}`;
  }

  function spend(resource, amount) {
    gameState.resources[resource] = Math.max(0, gameState.resources[resource] - amount);
  }

  function gain(resource, amount) {
    gameState.resources[resource] = (gameState.resources[resource] || 0) + amount;
  }

  function addEntry(text) {
    gameState.diary.unshift({ time: timestamp(), text });
    gameState.diary = gameState.diary.slice(0, 8); // keep the journal from growing forever
  }

  function findPerson(id) {
    return gameState.roster.find((p) => p.id === id);
  }

  // --- Rendering ---

  function render() {
    const heading = $("day-heading");
    if (heading) heading.textContent = `Day ${dayLabel(gameState.day)}.`;

    Object.keys(RESOURCE_IDS).forEach((key) => {
      const el = $(RESOURCE_IDS[key]);
      if (el) el.textContent = tally(gameState.resources[key]);
    });

    gameState.roster.forEach((person) => {
      const el = $(`${person.id}-note`);
      if (!el) return;
      el.textContent = person.note;
      el.style.color = person.critical ? "var(--blood)" : "";
    });

    const diaryList = $("diary-list");
    if (diaryList) {
      diaryList.innerHTML = "";
      gameState.diary.forEach((entry) => {
        const div = document.createElement("div");
        div.className = "diary-entry";
        const dateSpan = document.createElement("span");
        dateSpan.className = "date";
        dateSpan.textContent = entry.time;
        div.appendChild(dateSpan);
        div.appendChild(document.createTextNode(entry.text));
        diaryList.appendChild(div);
      });
    }

    updateButtonState();
  }

  function setDisabled(id, disabled) {
    const btn = $(id);
    if (btn) btn.disabled = disabled;
  }

  // Grey out actions the survivors can't currently afford.
  function updateButtonState() {
    const r = gameState.resources;
    setDisabled("btn-send", r.materials < 1);
    setDisabled("btn-patch", r.materials < 3);
    setDisabled("btn-rest", r.food < 1 || r.water < 1);
    setDisabled("btn-brace", r.food < 1 || r.water < 1 || r.bandages < 1);
  }

  // --- Actions ---

  function sendSomeoneOut() {
    spend("materials", 1);
    const found = 1 + Math.floor(Math.random() * 3); // 1-3 units
    gain("food", found);
    gain("water", Math.max(0, found - 1));
    addEntry(
      `Sent someone out past the fence. Came back with ${found} more day${found === 1 ? "" : "s"} of food and a bit of water.`
    );
    afterAction();
  }

  function patchTheWall() {
    spend("materials", 3);
    addEntry("Spent the afternoon shoring up the west wall. It'll hold a little longer.");
    afterAction();
  }

  function letThemRest() {
    spend("food", 1);
    spend("water", 1);
    const reyes = findPerson("reyes");
    if (reyes && reyes.critical) {
      reyes.restCount = (reyes.restCount || 0) + 1;
      if (reyes.restCount >= 2) {
        reyes.critical = false;
        reyes.note = "back on her feet, still weak";
      } else {
        reyes.note = "resting, fever holding steady";
      }
    }
    addEntry("Made everyone stop and rest. Reyes slept a little, which is more than yesterday.");
    afterAction();
  }

  function braceForNight() {
    spend("food", 1);
    spend("water", 1);
    spend("bandages", 1);
    const survivedDay = gameState.day;
    gameState.day += 1;
    addEntry(`Made it through night ${dayLabel(survivedDay).toLowerCase()}. Bolted the door and waited for light.`);
    afterAction();
  }

  function afterAction() {
    render();
    const user = window.getCurrentUser ? window.getCurrentUser() : null;
    if (user && window.saveGameState) {
      window.saveGameState(user.uid, gameState);
    }
  }

  function wireButtons() {
    [
      ["btn-send", sendSomeoneOut],
      ["btn-patch", patchTheWall],
      ["btn-rest", letThemRest],
      ["btn-brace", braceForNight],
    ].forEach(([id, handler]) => {
      const btn = $(id);
      if (btn) btn.addEventListener("click", handler);
    });
  }

  // --- Hooks the Firebase script in index.html calls into ---

  window.applyGameState = function (state) {
    gameState = Object.assign(defaultState(), state);
    render();
  };

  window.startNewGame = function () {
    gameState = defaultState();
    render();
  };

  function init() {
    wireButtons();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
