const gameSelect = document.querySelector("#game-select");
const setupToggle = document.querySelector("#setup-toggle");
const setupToggleMark = setupToggle.querySelector(".setup-mark");
const setupContent = document.querySelector("#setup-content");
const drawCooldownCheckbox = document.querySelector("#draw-cooldown-checkbox");
const dangerEstimatorCheckbox = document.querySelector("#danger-estimator-checkbox");
const dangerEstimate = document.querySelector("#danger-estimate");
const onTheBrinkField = document.querySelector("#on-the-brink-field");
const onTheBrinkCheckbox = document.querySelector("#on-the-brink-checkbox");
const mutationsField = document.querySelector("#mutations-field");
const mutationsCheckbox = document.querySelector("#mutations-checkbox");
const playerCountInput = document.querySelector("#player-count");
const difficultySelect = document.querySelector("#difficulty-select");
const legendaryOption = document.querySelector("#legendary-option");
const remainingCount = document.querySelector("#remaining-count");
const remainingEpidemicCount = document.querySelector("#remaining-epidemic-count");
const dangerEstimateValue = document.querySelector("#danger-estimate-value");
const dangerGauge = document.querySelector("#danger-gauge");
const roundCount = document.querySelector("#round-count");
const playerTurnCount = document.querySelector("#player-turn-count");
const resetButton = document.querySelector("#reset-button");
const resetLabel = document.querySelector("#reset-label");
const setupError = document.querySelector("#setup-error");
const drawButton = document.querySelector("#draw-button");
const drawButtonLabel = drawButton.querySelector("span");
const reorderButton = document.querySelector("#reorder-button");
const reorderPanel = document.querySelector("#reorder-panel");
const reorderCount = document.querySelector("#reorder-count");
const reorderCurrent = document.querySelector("#reorder-current");
const reorderSelection = document.querySelector("#reorder-selection");
const reorderStatus = document.querySelector("#reorder-status");
const reorderCancelButton = document.querySelector("#reorder-cancel");
const reorderApplyButton = document.querySelector("#reorder-apply");
const drawResultSlots = [
  document.querySelector("#draw-result-1"),
  document.querySelector("#draw-result-2")
];

const CARD_TYPES = {
  PLAYER: "player",
  EPIDEMIC: "epidemic"
};
const GAMES = {
  PANDEMIC: "pandemic",
  IBERIA: "iberia"
};
const BASE_PLAYER_CARDS = 48;
const CONFIG_STORAGE_KEY = "pandemic-player-deck-config-v1";
const EVENT_CARD_COUNTS = {
  pandemic: { standard: 5 },
  iberia: { 2: 4, 3: 5, 4: 6, 5: 8 }
};
const INITIAL_HAND_CARD_COUNTS = {
  2: 8,
  3: 9,
  4: 8,
  5: 10
};
const MAX_DECK_SIZE = 999;
const DRAW_FEEDBACK_DURATION_MS = 4000;
// Disable the cooldown while testing draw behavior unless cooldown behavior is under test.
const DRAW_COOLDOWN_MS = 5000;

const DEFAULT_CONFIG = {
  game: GAMES.PANDEMIC,
  onTheBrink: false,
  mutations: false,
  playerCount: 4,
  difficulty: 5
};

let config = { ...DEFAULT_CONFIG };
let deckConfig = { ...DEFAULT_CONFIG };
let settings = {
  drawCooldown: true,
  dangerEstimator: true
};
let deck = [];
let topIndex = 0;
let playerTurn = 1;
let knownTopCards = [];
let lastDrawnCards = [];
let deckWasReordered = false;
let savedGameState = null;
let reorderState = null;
let drawFeedbackTimeout = null;
let drawCooldownTimeout = null;
let drawCooldownInterval = null;

function updateConfigurationControls() {
  const isPandemic = gameSelect.value === GAMES.PANDEMIC;
  onTheBrinkField.hidden = !isPandemic;

  if (!isPandemic) {
    onTheBrinkCheckbox.checked = false;
  }

  const onTheBrinkEnabled = isPandemic && onTheBrinkCheckbox.checked;
  mutationsField.hidden = !onTheBrinkEnabled;
  if (!onTheBrinkEnabled) {
    mutationsCheckbox.checked = false;
  }

  const maximumPlayers = isPandemic ? (onTheBrinkEnabled ? 5 : 4) : 5;
  playerCountInput.max = maximumPlayers;
  if (playerCountInput.valueAsNumber > maximumPlayers) {
    playerCountInput.value = maximumPlayers;
  }

  const legendaryEnabled = isPandemic && onTheBrinkEnabled;
  legendaryOption.hidden = !legendaryEnabled;
  legendaryOption.disabled = !legendaryEnabled;
  if (!legendaryEnabled && difficultySelect.value === "7") {
    difficultySelect.value = "6";
  }
}

function updateConfigFromInputs() {
  updateConfigurationControls();
  config.game = gameSelect.value;
  config.onTheBrink = config.game === GAMES.PANDEMIC && onTheBrinkCheckbox.checked;
  config.mutations = config.onTheBrink && mutationsCheckbox.checked;
  config.playerCount = playerCountInput.valueAsNumber;
  config.difficulty = Number(difficultySelect.value);
  renderDeckStatus();
  saveConfigState();
}

function updateSettingsFromInputs() {
  settings.drawCooldown = drawCooldownCheckbox.checked;
  settings.dangerEstimator = dangerEstimatorCheckbox.checked;
  if (!settings.drawCooldown) {
    resetDrawFeedback();
  }
  renderDeckStatus();
  saveConfigState();
}

function toggleSetupContent() {
  const isExpanded = setupToggle.getAttribute("aria-expanded") === "true";
  setupToggle.setAttribute("aria-expanded", String(!isExpanded));
  setupToggleMark.textContent = isExpanded ? "+" : "−";
  setupContent.hidden = isExpanded;
}

function configsMatch() {
  return config.game === deckConfig.game &&
    config.onTheBrink === deckConfig.onTheBrink &&
    config.mutations === deckConfig.mutations &&
    config.playerCount === deckConfig.playerCount &&
    config.difficulty === deckConfig.difficulty;
}

function renderDeckStatus() {
  remainingCount.textContent = deck.length - topIndex;
  remainingEpidemicCount.textContent = deck
    .slice(topIndex)
    .filter((card) => card === CARD_TYPES.EPIDEMIC).length;
  const dangerProbability = estimateEpidemicDrawProbability();
  const dangerPercent = Math.round(dangerProbability * 100);
  dangerEstimateValue.textContent = `${String(dangerPercent).padStart(3, " ")}%`;
  dangerGauge.setAttribute("aria-valuenow", String(dangerPercent));
  dangerGauge.setAttribute(
    "aria-valuetext",
    `${dangerPercent}% estimated chance of at least one Epidemic in the next two cards`
  );
  dangerGauge.style.setProperty("--danger-percent", `${dangerPercent}%`);
  dangerEstimate.hidden = !settings.dangerEstimator;
  updateDangerTint(settings.dangerEstimator ? dangerProbability : 0);
  const completedTurns = playerTurn - 1;
  const round = Math.floor(completedTurns / deckConfig.playerCount) + 1;
  const player = (completedTurns % deckConfig.playerCount) + 1;
  roundCount.textContent = String(round);
  playerTurnCount.textContent = String(player);
  resetLabel.textContent = configsMatch() ? "Reset" : "New Game";
  const reorderAvailable = deckConfig.game === GAMES.IBERIA;
  reorderButton.hidden = !reorderAvailable;
  reorderButton.disabled = !reorderAvailable;
}

function getEstimatedPileSizes(ordinaryCardCount, epidemicCardCount) {
  const basePileSize = Math.floor(ordinaryCardCount / epidemicCardCount);
  const largerPileCount = ordinaryCardCount % epidemicCardCount;
  return Array.from(
    { length: epidemicCardCount },
    (_, index) => basePileSize + (index < largerPileCount ? 1 : 0) + 1
  );
}

function estimateEpidemicDrawProbability() {
  const cardsRemaining = deck.length - topIndex;
  const drawnCards = deck.slice(0, topIndex);
  const epidemicsRemaining = deckConfig.epidemicCards -
    drawnCards.filter((card) => card === CARD_TYPES.EPIDEMIC).length;
  const cardsToEstimate = Math.min(2, cardsRemaining);
  if (cardsToEstimate === 0 || epidemicsRemaining === 0 || deckConfig.epidemicCards === 0) {
    return 0;
  }

  const pileSizes = getEstimatedPileSizes(
    deck.length - deckConfig.epidemicCards,
    deckConfig.epidemicCards
  );
  let pileStart = 0;
  let probabilityOfNoEpidemic = 1;
  const drawEnd = topIndex + cardsToEstimate;

  for (const pileSize of pileSizes) {
    const pileEnd = pileStart + pileSize;
    const observedPileCards = [
      ...drawnCards.slice(pileStart, Math.min(topIndex, pileEnd)),
      ...knownTopCards.slice(
        Math.max(0, pileStart - topIndex),
        Math.max(0, Math.min(knownTopCards.length, pileEnd - topIndex))
      )
    ];
    const firstUpcomingPosition = Math.max(topIndex, pileStart);
    const lastUpcomingPosition = Math.min(drawEnd, pileEnd);
    for (let position = firstUpcomingPosition; position < lastUpcomingPosition; position += 1) {
      const knownIndex = position - topIndex;
      if (knownIndex >= 0 && knownIndex < knownTopCards.length &&
          knownTopCards[knownIndex] === CARD_TYPES.EPIDEMIC) {
        return 1;
      }
    }

    const epidemicLocated = observedPileCards.includes(CARD_TYPES.EPIDEMIC);

    if (!epidemicLocated) {
      const knownPlayerCards = observedPileCards.filter(
        (card) => card === CARD_TYPES.PLAYER
      ).length;
      let unknownUpcomingCards = 0;

      for (let position = firstUpcomingPosition; position < lastUpcomingPosition; position += 1) {
        const knownIndex = position - topIndex;
        const isKnown = knownIndex >= 0 && knownIndex < knownTopCards.length;
        if (!isKnown) {
          unknownUpcomingCards += 1;
        }
      }

      if (unknownUpcomingCards > 0) {
        const possibleEpidemicPositions = pileSize - knownPlayerCards;
        if (possibleEpidemicPositions > 0) {
          probabilityOfNoEpidemic *=
            1 - unknownUpcomingCards / possibleEpidemicPositions;
        }
      }
    }

    pileStart = pileEnd;
  }

  return 1 - probabilityOfNoEpidemic;
}

function updateDangerTint(probability) {
  const tint = Math.round(probability * 100);
  const interpolateColor = (start, end) => {
    const startValue = Number.parseInt(start.slice(1), 16);
    const endValue = Number.parseInt(end.slice(1), 16);
    const channels = [16, 8, 0].map((shift) => {
      const startChannel = (startValue >> shift) & 255;
      const endChannel = (endValue >> shift) & 255;
      return Math.round(startChannel + (endChannel - startChannel) * tint / 100);
    });
    return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  };

  document.body.style.setProperty("--danger-page-background", interpolateColor("#edf1ed", "#f4e9e3"));
  document.body.style.setProperty("--danger-surface-background", interpolateColor("#fffefa", "#fff8f4"));
}

function renderDrawResults(cards, emptyMessage = "No card drawn") {
  drawResultSlots.forEach((slot, index) => {
    const card = cards[index];

    if (card) {
      slot.dataset.cardType = card;
      slot.dataset.empty = "false";
      const accessibleLabel = document.createElement("span");
      accessibleLabel.className = "visually-hidden";
      accessibleLabel.textContent = getCardLabel(card);

      slot.replaceChildren(createCardSymbol(card), accessibleLabel);
    } else {
      delete slot.dataset.cardType;
      slot.dataset.empty = "true";
      const accessibleLabel = document.createElement("span");
      accessibleLabel.className = "visually-hidden";
      accessibleLabel.textContent = emptyMessage;
      slot.replaceChildren(accessibleLabel);
    }
  });
}

function getCardLabel(cardType) {
  return cardType === CARD_TYPES.EPIDEMIC ? "Epidemic" : "Player Card";
}

function createCardSymbol(cardType) {
  const symbol = document.createElement("span");
  symbol.className = `symbol ${cardType}-symbol`;
  symbol.setAttribute("aria-hidden", "true");

  if (cardType === CARD_TYPES.PLAYER) {
    symbol.append(document.createElement("span"));
  } else {
    symbol.textContent = "\u2623";
  }

  return symbol;
}

function createReorderCard(cardType, position, onRemove) {
  const isInteractive = typeof onRemove === "function";
  const card = document.createElement(isInteractive ? "button" : "span");
  card.className = isInteractive ? "reorder-card reorder-selected-card" : "reorder-card";
  if (isInteractive) {
    card.type = "button";
    card.setAttribute("aria-label", `Return ${getCardLabel(cardType)} from new-order position ${position + 1} to current order`);
    card.addEventListener("click", onRemove);
  } else {
    card.setAttribute("role", "listitem");
    card.setAttribute("aria-label", `${getCardLabel(cardType)}, position ${position + 1}`);
  }

  const positionLabel = document.createElement("span");
  positionLabel.className = "reorder-card-position";
  positionLabel.setAttribute("aria-hidden", "true");
  positionLabel.textContent = String(position + 1).padStart(2, "0");
  card.append(positionLabel, createCardSymbol(cardType));
  return card;
}

function createReorderSourceCard(cardType, sourceIndex, selected) {
  if (selected) {
    const placeholder = document.createElement("span");
    placeholder.className = "reorder-empty-slot";
    placeholder.setAttribute("aria-label", `Position ${sourceIndex + 1}, moved to new order`);
    placeholder.textContent = String(sourceIndex + 1).padStart(2, "0");
    return placeholder;
  }

  const card = document.createElement("button");
  card.className = "reorder-source-card";
  card.type = "button";
  card.setAttribute("aria-label", `Move ${getCardLabel(cardType)} from position ${sourceIndex + 1} to the next new-order position`);

  const positionLabel = document.createElement("span");
  positionLabel.className = "reorder-card-position";
  positionLabel.setAttribute("aria-hidden", "true");
  positionLabel.textContent = String(sourceIndex + 1).padStart(2, "0");
  card.append(positionLabel, createCardSymbol(cardType));
  card.addEventListener("click", () => {
    reorderState.selectedIndices.push(sourceIndex);
    renderReorderPanel();
    focusReorderSource();
  });
  return card;
}

function focusReorderSource() {
  const nextCard = reorderCurrent.querySelector(".reorder-source-card");
  (nextCard || reorderApplyButton).focus();
}

function renderReorderPanel() {
  const { cards, selectedIndices } = reorderState;
  const selected = new Set(selectedIndices);
  reorderCount.textContent = `${cards.length} ${cards.length === 1 ? "CARD" : "CARDS"}`;
  reorderCurrent.replaceChildren(...cards.map((card, index) =>
    createReorderSourceCard(card, index, selected.has(index))
  ));

  const orderedCards = selectedIndices.map((sourceIndex) => cards[sourceIndex]);
  const orderSlots = cards.map((card, index) => {
    if (index < orderedCards.length) {
      return createReorderCard(orderedCards[index], index, () => {
        selectedIndices.splice(index, 1);
        renderReorderPanel();
        focusReorderSource();
      });
    }

    const emptySlot = document.createElement("span");
    emptySlot.className = "reorder-empty-slot";
    emptySlot.setAttribute("role", "listitem");
    emptySlot.setAttribute("aria-label", `Order position ${index + 1}, empty`);
    emptySlot.textContent = String(index + 1).padStart(2, "0");
    return emptySlot;
  });
  reorderSelection.replaceChildren(...orderSlots);

  reorderStatus.textContent = cards.length === 0 ? "No cards remaining." :
    `${selectedIndices.length} of ${cards.length} selected`;
  reorderApplyButton.disabled = cards.length === 0 || selectedIndices.length !== cards.length;
}

function openReorderPanel() {
  if (deckConfig.game !== GAMES.IBERIA) {
    return;
  }

  const cardsAvailable = Math.min(3, deck.length - topIndex);
  reorderState = {
    startIndex: topIndex,
    cards: deck.slice(topIndex, topIndex + cardsAvailable),
    selectedIndices: []
  };
  knownTopCards = [...reorderState.cards];
  reorderPanel.hidden = false;
  reorderButton.setAttribute("aria-expanded", "true");
  renderReorderPanel();
  renderDeckStatus();
  saveConfigState();
  const firstCard = reorderCurrent.querySelector(".reorder-source-card");
  (firstCard || reorderCancelButton).focus();
}

function closeReorderPanel(returnFocus = true) {
  reorderPanel.hidden = true;
  reorderButton.setAttribute("aria-expanded", "false");
  reorderState = null;
  if (returnFocus) {
    reorderButton.focus();
  }
}

function toggleReorderPanel() {
  if (reorderPanel.hidden) {
    openReorderPanel();
  } else {
    closeReorderPanel();
  }
}

function applyReorder() {
  if (!reorderState || reorderState.selectedIndices.length !== reorderState.cards.length ||
      topIndex !== reorderState.startIndex) {
    return;
  }

  const reorderedCards = reorderState.selectedIndices.map((sourceIndex) =>
    reorderState.cards[sourceIndex]
  );
  if (reorderedCards.some((card, index) => card !== reorderState.cards[index])) {
    deckWasReordered = true;
  }
  deck.splice(topIndex, reorderedCards.length, ...reorderedCards);
  knownTopCards = [...reorderedCards];
  closeReorderPanel(false);
  renderDeckStatus();
  saveConfigState();
}

function drawTwoCards() {
  const cardsAvailable = deck.length - topIndex;
  if (cardsAvailable === 0 || drawButton.disabled) {
    return [];
  }

  if (!reorderPanel.hidden) {
    closeReorderPanel(false);
  }

  const cardsToDraw = Math.min(2, cardsAvailable);
  const drawnCards = deck.slice(topIndex, topIndex + cardsToDraw);

  topIndex += drawnCards.length;
  knownTopCards = knownTopCards.slice(drawnCards.length);
  lastDrawnCards = drawnCards;
  if (drawnCards.length > 0) {
    playerTurn += 1;
    startDrawFeedback();
  }
  renderDrawResults(drawnCards, "Empty");
  renderDeckStatus();
  saveConfigState();
  return drawnCards;
}

function startDrawFeedback() {
  document.body.classList.add("draw-feedback");
  window.clearTimeout(drawFeedbackTimeout);
  drawFeedbackTimeout = window.setTimeout(() => {
    document.body.classList.remove("draw-feedback");
  }, DRAW_FEEDBACK_DURATION_MS);

  if (!settings.drawCooldown) {
    return;
  }

  drawButton.disabled = true;
  const cooldownEndsAt = Date.now() + DRAW_COOLDOWN_MS;
  const updateCooldownLabel = () => {
    const secondsRemaining = Math.ceil((cooldownEndsAt - Date.now()) / 1000);
    drawButtonLabel.textContent = `Draw again in ${secondsRemaining}s`;
  };

  updateCooldownLabel();
  drawCooldownInterval = window.setInterval(updateCooldownLabel, 250);
  drawCooldownTimeout = window.setTimeout(() => {
    window.clearInterval(drawCooldownInterval);
    drawButton.disabled = false;
    drawButtonLabel.textContent = "Draw 2 Cards";
  }, DRAW_COOLDOWN_MS);
}

function resetDrawFeedback() {
  window.clearTimeout(drawFeedbackTimeout);
  window.clearTimeout(drawCooldownTimeout);
  window.clearInterval(drawCooldownInterval);
  drawFeedbackTimeout = null;
  drawCooldownTimeout = null;
  drawCooldownInterval = null;
  document.body.classList.remove("draw-feedback");
  drawButton.disabled = false;
  drawButtonLabel.textContent = "Draw 2 Cards";
}

function validateConfig(sourceConfig = config) {
  const { game, onTheBrink, mutations, playerCount, difficulty } = sourceConfig;

  if (game !== GAMES.PANDEMIC && game !== GAMES.IBERIA) {
    throw new Error("Choose Pandemic or Iberia.");
  }

  const maximumPlayers = game === GAMES.PANDEMIC ? (onTheBrink ? 5 : 4) : 5;
  if (!Number.isSafeInteger(playerCount) || playerCount < 2 || playerCount > maximumPlayers) {
    throw new Error(`Player count must be from 2 to ${maximumPlayers} for this setup.`);
  }

  if (onTheBrink && game !== GAMES.PANDEMIC) {
    throw new Error("On The Brink is only available with Pandemic.");
  }

  if (mutations && (!onTheBrink || game !== GAMES.PANDEMIC)) {
    throw new Error("Mutations is only available with On The Brink.");
  }

  const availableDifficulties = game === GAMES.PANDEMIC && onTheBrink ? [4, 5, 6, 7] : [4, 5, 6];
  if (!availableDifficulties.includes(difficulty)) {
    throw new Error("Choose a difficulty available for this game.");
  }

  const eventCards = game === GAMES.IBERIA
    ? EVENT_CARD_COUNTS.iberia[playerCount]
    : onTheBrink ? 2 * playerCount : EVENT_CARD_COUNTS.pandemic.standard;
  const mutationCards = mutations ? 3 : 0;
  const initialHandCards = INITIAL_HAND_CARD_COUNTS[playerCount];
  const ordinaryCardsAfterHands = BASE_PLAYER_CARDS + eventCards + mutationCards - initialHandCards;
  const totalCards = ordinaryCardsAfterHands + difficulty;

  if (ordinaryCardsAfterHands < 0 || totalCards > MAX_DECK_SIZE) {
    throw new Error("This configuration cannot produce a valid deck.");
  }

  return {
    game,
    onTheBrink,
    mutations,
    playerCount,
    difficulty,
    eventCards,
    mutationCards,
    initialHandCards,
    epidemicCards: difficulty
  };
}

function shuffle(cards) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
}

function getPileSizes(ordinaryCardCount, epidemicCardCount) {
  const average = ordinaryCardCount / epidemicCardCount;
  const minimumSize = Math.max(0, Math.floor(average) - 2);
  const maximumSize = Math.ceil(average) + 2;
  const sizeProfiles = [];

  function collectProfiles(remainingCards, remainingPiles, largestSize, sizes) {
    if (remainingPiles === 0) {
      if (remainingCards === 0 && sizes[0] - sizes[sizes.length - 1] <= 2) {
        sizeProfiles.push(sizes);
      }
      return;
    }

    const largestAllowed = Math.min(largestSize, remainingCards);
    for (let size = largestAllowed; size >= minimumSize; size -= 1) {
      const cardsAfterPile = remainingCards - size;
      const pilesAfterPile = remainingPiles - 1;
      if (cardsAfterPile < minimumSize * pilesAfterPile ||
          cardsAfterPile > size * pilesAfterPile) {
        continue;
      }

      collectProfiles(
        cardsAfterPile,
        pilesAfterPile,
        size,
        [...sizes, size]
      );
    }
  }

  collectProfiles(ordinaryCardCount, epidemicCardCount, maximumSize, []);
  return sizeProfiles[Math.floor(Math.random() * sizeProfiles.length)];
}

function buildDeck({ eventCards, mutationCards, initialHandCards, epidemicCards }) {
  const ordinaryCards = Array(BASE_PLAYER_CARDS + eventCards + mutationCards).fill(CARD_TYPES.PLAYER);
  ordinaryCards.splice(0, initialHandCards);

  if (epidemicCards === 0) {
    return ordinaryCards;
  }

  const pileSizes = getPileSizes(ordinaryCards.length, epidemicCards);
  const piles = [];
  let nextPlayerCard = 0;

  for (const ordinaryCount of pileSizes) {
    const pile = ordinaryCards.slice(nextPlayerCard, nextPlayerCard + ordinaryCount);
    nextPlayerCard += ordinaryCount;
    pile.push(CARD_TYPES.EPIDEMIC);
    shuffle(pile);
    piles.push(pile);
  }

  piles.sort((firstPile, secondPile) => secondPile.length - firstPile.length);

  const newDeck = [];
  for (const pile of piles) {
    for (const cardType of pile) {
      newDeck.push(cardType);
    }
  }

  return newDeck;
}

function getConfigFields(sourceConfig) {
  return {
    game: sourceConfig.game,
    onTheBrink: sourceConfig.onTheBrink,
    mutations: sourceConfig.mutations,
    playerCount: sourceConfig.playerCount,
    difficulty: sourceConfig.difficulty
  };
}

function getGameStateSnapshot() {
  return {
    deck: [...deck],
    topIndex,
    playerTurn,
    knownTopCards: [...knownTopCards],
    lastDrawnCards: [...lastDrawnCards],
    deckWasReordered
  };
}

function restoreGameState(savedGameState, validatedDeckConfig) {
  if (!savedGameState || !Array.isArray(savedGameState.deck) ||
      !Number.isSafeInteger(savedGameState.topIndex) ||
      !Number.isSafeInteger(savedGameState.playerTurn) ||
      !Array.isArray(savedGameState.knownTopCards) ||
      !Array.isArray(savedGameState.lastDrawnCards) ||
      (savedGameState.deckWasReordered !== undefined &&
        typeof savedGameState.deckWasReordered !== "boolean")) {
    return false;
  }

  const expectedDeckSize = validatedDeckConfig.eventCards +
    BASE_PLAYER_CARDS + validatedDeckConfig.mutationCards -
    validatedDeckConfig.initialHandCards + validatedDeckConfig.epidemicCards;
  const playerCardCount = savedGameState.deck.filter(
    (card) => card === CARD_TYPES.PLAYER
  ).length;
  const epidemicCardCount = savedGameState.deck.filter(
    (card) => card === CARD_TYPES.EPIDEMIC
  ).length;
  const isValidCard = (card) =>
    card === CARD_TYPES.PLAYER || card === CARD_TYPES.EPIDEMIC;

  if (savedGameState.deck.length !== expectedDeckSize ||
      savedGameState.deck.some((card) => !isValidCard(card)) ||
      playerCardCount + epidemicCardCount !== expectedDeckSize ||
      epidemicCardCount !== validatedDeckConfig.epidemicCards ||
      savedGameState.topIndex < 0 ||
      savedGameState.topIndex > savedGameState.deck.length ||
      savedGameState.playerTurn < 1 ||
      savedGameState.playerTurn > Math.ceil(expectedDeckSize / 2) + 1 ||
      savedGameState.knownTopCards.length > 3 ||
      savedGameState.knownTopCards.some((card) => !isValidCard(card)) ||
      savedGameState.lastDrawnCards.length > 2 ||
      savedGameState.lastDrawnCards.some((card) => !isValidCard(card)) ||
      savedGameState.knownTopCards.some(
        (card, index) => card !== savedGameState.deck[savedGameState.topIndex + index]
      ) ||
      savedGameState.lastDrawnCards.some(
        (card, index) =>
          card !== savedGameState.deck[
            savedGameState.topIndex - savedGameState.lastDrawnCards.length + index
          ]
      )) {
    return false;
  }

  deck = [...savedGameState.deck];
  topIndex = savedGameState.topIndex;
  playerTurn = savedGameState.playerTurn;
  knownTopCards = [...savedGameState.knownTopCards];
  lastDrawnCards = [...savedGameState.lastDrawnCards];
  deckWasReordered = savedGameState.deckWasReordered === true;
  return true;
}

function saveConfigState() {
  try {
    const savedState = {
      config: getConfigFields(validateConfig(config)),
      deckConfig: getConfigFields(validateConfig(deckConfig)),
      settings,
      gameState: getGameStateSnapshot()
    };
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(savedState));
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      setupError.textContent = "Browser storage is full; game progress could not be saved.";
    } else if (error instanceof DOMException) {
      setupError.textContent = "Game progress could not be saved in this browser.";
    } else if (error instanceof Error) {
      setupError.textContent = error.message;
    } else {
      setupError.textContent = "Game progress could not be saved in this browser.";
    }
  }
}

function restoreConfigState() {
  try {
    const savedValue = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!savedValue) {
      return;
    }

    const savedState = JSON.parse(savedValue);
    const restoredConfig = validateConfig(savedState.config);
    const restoredDeckConfig = validateConfig(savedState.deckConfig);
    config = getConfigFields(restoredConfig);
    deckConfig = restoredDeckConfig;
    savedGameState = savedState.gameState || null;
    if (savedState.settings && typeof savedState.settings === "object") {
      settings = {
        drawCooldown: savedState.settings.drawCooldown !== false,
        dangerEstimator: savedState.settings.dangerEstimator !== false
      };
    }
  } catch (error) {
    config = { ...DEFAULT_CONFIG };
    deckConfig = { ...DEFAULT_CONFIG };
    savedGameState = null;
    setupError.textContent = error instanceof DOMException
      ? "Saved game data could not be read from this browser."
      : "Saved game data was invalid; a new game will be started.";
  }
}

function initializeDeckFromSnapshot() {
  const nextDeckConfig = validateConfig(deckConfig);
  deckConfig = nextDeckConfig;
  if (!restoreGameState(savedGameState, nextDeckConfig)) {
    deck = buildDeck(nextDeckConfig);
    topIndex = 0;
    playerTurn = 1;
    knownTopCards = [];
    lastDrawnCards = [];
    deckWasReordered = false;
    if (savedGameState) {
      setupError.textContent = "Saved game data was invalid; a new game has been started.";
    }
  }
  renderDrawResults(lastDrawnCards);
  renderDeckStatus();
}

function resetDeck() {
  if ((topIndex > 0 || deckWasReordered) &&
      !window.confirm("Start a new game? Your current deck and progress will be lost.")) {
    return false;
  }

  setupError.textContent = "";

  try {
    const nextDeckConfig = validateConfig();
    const nextDeck = buildDeck(nextDeckConfig);

    deck = nextDeck;
    topIndex = 0;
    playerTurn = 1;
    knownTopCards = [];
    lastDrawnCards = [];
    deckWasReordered = false;
    deckConfig = nextDeckConfig;
    resetDrawFeedback();
    closeReorderPanel(false);
    renderDrawResults([]);
    renderDeckStatus();
    saveConfigState();
    return true;
  } catch (error) {
    setupError.textContent = error.message;
    return false;
  }
}

window.debugDeck = function () {
  console.log("Requested configuration:", { ...config });
  console.log("In-play deck configuration:", { ...deckConfig });
  console.log("Top index:", topIndex);
  console.table(
    deck.map((card, index) => ({
      position: index,
      type: card,
      status: index < topIndex ? "Drawn" :
        index === topIndex ? "NEXT" : "Undrawn"
    }))
  );
};

restoreConfigState();
gameSelect.value = config.game;
drawCooldownCheckbox.checked = settings.drawCooldown;
dangerEstimatorCheckbox.checked = settings.dangerEstimator;
onTheBrinkCheckbox.checked = config.onTheBrink;
mutationsCheckbox.checked = config.mutations;
playerCountInput.value = config.playerCount;
difficultySelect.value = String(config.difficulty);
updateConfigurationControls();
initializeDeckFromSnapshot();
updateConfigFromInputs();
gameSelect.addEventListener("change", updateConfigFromInputs);
setupToggle.addEventListener("click", toggleSetupContent);
drawCooldownCheckbox.addEventListener("change", updateSettingsFromInputs);
dangerEstimatorCheckbox.addEventListener("change", updateSettingsFromInputs);
onTheBrinkCheckbox.addEventListener("change", updateConfigFromInputs);
mutationsCheckbox.addEventListener("change", updateConfigFromInputs);
playerCountInput.addEventListener("input", updateConfigFromInputs);
difficultySelect.addEventListener("change", updateConfigFromInputs);
drawButton.addEventListener("click", drawTwoCards);
resetButton.addEventListener("click", resetDeck);
reorderButton.addEventListener("click", toggleReorderPanel);
reorderCancelButton.addEventListener("click", () => closeReorderPanel());
reorderApplyButton.addEventListener("click", applyReorder);
reorderPanel.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeReorderPanel();
  }
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register(new URL("./service-worker.js", document.baseURI), {
    scope: new URL("./", document.baseURI).pathname
  }).catch((error) => {
    console.error("Offline support could not be enabled.", error);
  });
}