// Global game state (required by spec)
const gameState = {
  chapter: 1,
  perspective: null, // "boy" or null
  visitedObjects: [],
  daughterScenes: [],
  flags: {},
  currentSceneId: null
};

(function () {
  "use strict";

  const backgroundEl = document.getElementById("background");
  const chapterLabelEl = document.getElementById("chapter-label");
  const textContentEl = document.getElementById("text-content");
  const choicesEl = document.getElementById("choices");
  const objectsContainerEl = document.getElementById("objects-container");
  const gameRootEl = document.getElementById("game");
  const toastEl = document.getElementById("toast");
  const thoughtPopupEl = document.getElementById("thought-popup");

  let isTransitioning = false;
  let isTyping = false;
  let typingTimeoutId = null;
  let currentFullText = "";
  let currentCharIndex = 0;
  let toastTimeoutId = null;
  let thoughtTimeoutId = null;

  function resetGameState() {
    gameState.chapter = 1;
    gameState.perspective = null;
    gameState.visitedObjects = [];
    gameState.daughterScenes = [];
    gameState.flags = {};
    gameState.currentSceneId = story.firstSceneId;
  }

  function initGame() {
    resetGameState();
    attachGlobalSkipHandler();
    attachThoughtPopupHandler();
    loadScene(story.firstSceneId, true);
  }

  function attachGlobalSkipHandler() {
    document.addEventListener("click", function (e) {
      if (!isTyping) return;
      // If user clicks inside UI while text is typing, finish instantly
      const insideUI = e.target.closest("#ui");
      if (insideUI) {
        finishTypingImmediately();
      }
    });
  }

  function attachThoughtPopupHandler() {
    if (!thoughtPopupEl) return;
    thoughtPopupEl.addEventListener("click", function () {
      hideThoughtPopup();
    });
  }

  function loadScene(sceneId, immediate) {
    const scene = story.scenes[sceneId];
    if (!scene || isTransitioning) return;

    gameState.currentSceneId = sceneId;

    // Update chapter number for global state (best-effort parsing)
    const chapterNum = parseInt(String(sceneId).split(".")[0], 10);
    if (!isNaN(chapterNum)) {
      gameState.chapter = chapterNum;
    }

    // Toast for неправильный выбор в маршрутке
    if (sceneId === "2.1_wrong") {
      showToast("Это решение ни на что не повлияет");
    } else {
      hideToast();
    }

    isTransitioning = true;
    gameRootEl.classList.remove("fade-in");
    gameRootEl.classList.add("fade-out");

    setTimeout(function () {
      applySceneStateChanges(sceneId, scene);
      renderScene(sceneId, scene);
      gameRootEl.classList.remove("fade-out");
      gameRootEl.classList.add("fade-in");
      setTimeout(function () {
        isTransitioning = false;
      }, 300);
    }, immediate ? 0 : 260);
  }

  function applySceneStateChanges(sceneId, scene) {
    if (!scene) return;

    // Perspective selection (e.g. смотреть историю его глазами)
    if (scene.setPerspective) {
      gameState.perspective = scene.setPerspective;
    }

    // Track visited apartment objects for Глава 4
    if (scene.markVisitedObject) {
      const objId = scene.markVisitedObject;
      if (!gameState.visitedObjects.includes(objId)) {
        gameState.visitedObjects.push(objId);
      }
    }

    // Track daughter mini‑сцены
    if (scene.meta && scene.meta.daughterSceneId) {
      const id = scene.meta.daughterSceneId;
      if (!gameState.daughterScenes.includes(id)) {
        gameState.daughterScenes.push(id);
      }
    }
  }

  function resolveSceneText(scene) {
    // Scene may have textVariants depending on perspective
    if (scene.textVariants) {
      if (gameState.perspective === "boy" && scene.textVariants.boy) {
        return scene.textVariants.boy;
      }
      return scene.textVariants.default || "";
    }
    return scene.text || "";
  }

  function renderScene(sceneId, scene) {
    if (!scene) scene = story.scenes[sceneId];
    if (!scene) return;

    // Background
    backgroundEl.style.backgroundImage = scene.background
      ? 'url("' + scene.background + '")'
      : "none";

    // Chapter label
    chapterLabelEl.textContent = scene.chapter || "";

    // Clear interactive elements
    clearTyping();
    textContentEl.textContent = "";
    textContentEl.classList.remove("typing-done");
    choicesEl.innerHTML = "";
    objectsContainerEl.innerHTML = "";

    // Typewriter effect
    const text = resolveSceneText(scene);
    startTyping(text, function () {
      buildObjects(scene);
      buildChoices(scene);
      scheduleThoughtPopup(scene);
    });
  }

  function startTyping(text, onComplete) {
    clearTyping();
    isTyping = true;
    textContentEl.classList.add("typing");
    textContentEl.classList.remove("typing-done");
    currentFullText = text;
    currentCharIndex = 0;
    textContentEl.textContent = "";

    const speed = 22; // ms per character

    function step() {
      if (currentCharIndex >= currentFullText.length) {
        isTyping = false;
        textContentEl.classList.remove("typing");
        textContentEl.classList.add("typing-done");
        if (typeof onComplete === "function") onComplete();
        return;
      }
      textContentEl.textContent += currentFullText[currentCharIndex];
      currentCharIndex += 1;
      typingTimeoutId = setTimeout(step, speed);
    }

    step();
  }

  function clearTyping() {
    if (typingTimeoutId !== null) {
      clearTimeout(typingTimeoutId);
      typingTimeoutId = null;
    }
    isTyping = false;
    currentFullText = "";
    currentCharIndex = 0;
  }

  function finishTypingImmediately() {
    if (!isTyping) return;
    clearTyping();
    textContentEl.textContent = currentFullText;
    textContentEl.classList.remove("typing");
    textContentEl.classList.add("typing-done");

    // When skipping typing, we still need to build choices/objects.
    const scene = story.scenes[gameState.currentSceneId];
    buildObjects(scene);
    buildChoices(scene);
    scheduleThoughtPopup(scene);
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    if (toastTimeoutId !== null) {
      clearTimeout(toastTimeoutId);
    }
    toastTimeoutId = setTimeout(function () {
      hideToast();
    }, 2500);
  }

  function hideToast() {
    if (!toastEl) return;
    toastEl.classList.remove("visible");
    if (toastTimeoutId !== null) {
      clearTimeout(toastTimeoutId);
      toastTimeoutId = null;
    }
  }

  function scheduleThoughtPopup(scene) {
    if (!thoughtPopupEl) return;
    hideThoughtPopup();
    if (!scene || !scene.meta || !scene.meta.thoughtPopup) return;

    const text = scene.meta.thoughtPopup;
    thoughtTimeoutId = setTimeout(function () {
      const inner =
        thoughtPopupEl.firstElementChild ||
        document.createElement("div");
      inner.textContent = text;
      if (!thoughtPopupEl.firstElementChild) {
        thoughtPopupEl.appendChild(inner);
      }
      thoughtPopupEl.classList.add("visible");
    }, 1000);
  }

  function hideThoughtPopup() {
    if (!thoughtPopupEl) return;
    thoughtPopupEl.classList.remove("visible");
    if (thoughtTimeoutId !== null) {
      clearTimeout(thoughtTimeoutId);
      thoughtTimeoutId = null;
    }
  }

  function buildObjects(scene) {
    objectsContainerEl.innerHTML = "";

    if (!scene || !scene.interactiveObjects) return;

    scene.interactiveObjects.forEach(function (obj) {
      const btn = document.createElement("button");
      btn.className = "object-button";
      btn.textContent = obj.label;

      const visited = gameState.visitedObjects.includes(obj.id);
      if (visited) {
        btn.classList.add("visited");
      }

      btn.addEventListener("click", function () {
        handleObjectClick(obj);
      });

      objectsContainerEl.appendChild(btn);
    });
  }

  function handleObjectClick(obj) {
    if (!gameState.visitedObjects.includes(obj.id)) {
      gameState.visitedObjects.push(obj.id);
    }

    // Append small mini‑scene text below the main text
    const mini = document.createElement("div");
    mini.style.marginTop = "0.75rem";
    mini.style.fontSize = "0.9rem";
    mini.style.opacity = "0.9";
    mini.style.color = "#cbd5f5";
    mini.textContent = obj.description;
    textContentEl.appendChild(mini);

    // Re-render objects to update visited styles
    const scene = story.scenes[gameState.currentSceneId];
    buildObjects(scene);
  }

  function buildChoices(scene) {
    choicesEl.innerHTML = "";
    if (!scene || !Array.isArray(scene.choices)) return;

    const allDaughterVisited = haveVisitedAllDaughterScenes();
    const visitedObjectsCount = gameState.visitedObjects.length;

    scene.choices.forEach(function (choice) {
      const btn = document.createElement("button");
      btn.className = "choice-button";
      if (choice.style === "secondary") {
        btn.classList.add("secondary");
      }

      btn.textContent = choice.text || "Continue";

      let logicDisabled = false;
      let hintText = "";

      // Chapter 4 requirement: need at least 2 visited objects
      if (
        typeof choice.requiresVisitedObjectsAtLeast === "number" &&
        visitedObjectsCount < choice.requiresVisitedObjectsAtLeast
      ) {
        logicDisabled = true;
        hintText =
          choice.lockedHint ||
          "Explore at least " +
            choice.requiresVisitedObjectsAtLeast +
            " things first";
      }

      // Chapter 5 requirement: all daughter scenes
      if (choice.requiresAllDaughterScenes && !allDaughterVisited) {
        logicDisabled = true;
        hintText =
          choice.lockedHint ||
          "Listen to all of her stories before moving on";
      }

      if (hintText) {
        btn.dataset.hint = hintText;
      }

      if (logicDisabled) {
        btn.classList.add("disabled-logic");
      }

      // Disable during typing to prevent spam
      if (isTyping) {
        btn.disabled = true;
      }

      btn.addEventListener("click", function () {
        if (isTransitioning) return;

        if (logicDisabled) {
          return; // Respect locked logic
        }

        handleChoiceClick(choice);
      });

      choicesEl.appendChild(btn);
    });

    // If typing already finished, ensure buttons are enabled
    if (!isTyping) {
      const btns = choicesEl.querySelectorAll(".choice-button");
      btns.forEach(function (b) {
        if (!b.classList.contains("disabled-logic")) {
          b.disabled = false;
        }
      });
    }
  }

  function haveVisitedAllDaughterScenes() {
    const needed = ["shrimp", "bunny", "monkey", "psycho"];
    return needed.every(function (id) {
      return gameState.daughterScenes.includes(id);
    });
  }

  function handleChoiceClick(choice) {
    if (isTyping || isTransitioning) return;

    // Special restart behavior on final screen
    if (choice.restart) {
      resetGameState();
      loadScene(story.firstSceneId);
      return;
    }

    // Bus chapter: wrong answers loop back with no branching
    if (choice.wrong && choice.next) {
      loadScene(choice.next);
      return;
    }

    if (choice.correct && choice.next) {
      loadScene(choice.next);
      return;
    }

    // Generic next
    if (choice.next === "restart") {
      resetGameState();
      loadScene(story.firstSceneId);
      return;
    }

    if (choice.next) {
      loadScene(choice.next);
    }
  }

  document.addEventListener("DOMContentLoaded", initGame);
})();

