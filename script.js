// ==========================================
// CONFIG & STATE
// ==========================================
const ROMANCE_PASSWORD = "261213";

const VIEWS = [
    'homepage-container',
    'historical-library-container',
    'fantasy-library-container',
    'romance-library-container',
    'game-container'
];

// Fresh state for a new playthrough
function createState(previousView = 'home') {
    return {
        stats: {},          // Numeric/text stats shown in the HUD
        flags: {},          // Story flags
        currentFile: '',    // Act JSON file currently loaded
        currentNode: '',    // Node currently on screen
        previousNode: '',   // Node the player came from (used by variants)
        previousView        // Which library to return to
    };
}

let gameState = createState();
let history = [];           // Snapshots of gameState, one per scene visited (powers the back button)
const storyCache = {};      // Loaded JSON files, so we only fetch each once

// ==========================================
// VIEW HELPERS
// ==========================================
const $ = (id) => document.getElementById(id);

function showView(viewId) {
    VIEWS.forEach(id => {
        const el = $(id);
        if (el) el.classList.toggle('hidden', id !== viewId);
    });
}

function returnToHome() {
    showView('homepage-container');
}

function openGenreLibrary(genre) {
    showView(`${genre}-library-container`);
}

// Back to whichever library the story was started from
function smartBack() {
    showView(`${gameState.previousView}-library-container`);
}

// ==========================================
// PASSWORD MODAL (Romance)
// ==========================================
function openPasswordModal() {
    $('password-modal').classList.remove('hidden');
    $('genre-password').value = "";
    $('password-error').innerText = "";
}

function closePasswordModal() {
    $('password-modal').classList.add('hidden');
}

function unlockRomance() {
    if ($('genre-password').value === ROMANCE_PASSWORD) {
        closePasswordModal();
        showView('romance-library-container');
    } else {
        $('password-error').innerText = "Incorrect password. Try again.";
    }
}

// ==========================================
// STORY DATA
// ==========================================
async function fetchStory(file) {
    if (storyCache[file]) return storyCache[file];

    const response = await fetch(file);
    if (!response.ok) throw new Error(`Failed to load ${file}`);

    storyCache[file] = await response.json();
    return storyCache[file];
}

// Some files wrap nodes in { nodes: {...} }, others are the nodes themselves
const getNodes = (data) => data.nodes || data;

// Look up a story variable (identity, temperament, familyOrigin, etc.).
// Checks stats first, then the root state, ignoring letter case so
// "familyorigin" and "familyOrigin" are treated as the same thing.
function getVar(name) {
    const target = name.toLowerCase();
    for (const source of [gameState.stats, gameState]) {
        for (const [key, value] of Object.entries(source)) {
            if (key.toLowerCase() === target && typeof value !== 'object' && value !== '') {
                return value;
            }
        }
    }
    return undefined;
}

// ==========================================
// STARTING A STORY
// ==========================================
async function startStory(startFile, originView = 'historical') {
    gameState = createState(originView);
    gameState.currentFile = startFile;
    history = [];
    lastTracked = null;   // so the first scene doesn't highlight everything

    const genreName = originView.charAt(0).toUpperCase() + originView.slice(1);
    $('back-to-library-btn').innerText = `← Back to ${genreName} Library`;
    showView('game-container');

    try {
        const data = await fetchStory(startFile);

        // Optional starting variables and stats defined in the JSON
        Object.assign(gameState, data.initial_variables);
        gameState.stats = { ...data.initial_stats };

        const startNode = data.start_node || Object.keys(getNodes(data))[0];
        await renderNode(startNode);
    } catch (error) {
        console.error("Error starting story:", error);
    }
}

// ==========================================
// TEXT RENDERING
// ==========================================

// Handles <<if $var is "x">> ... <<elseif $var is "y">> ... <<else>> ... <</if>>
function parseConditionals(rawText) {
    if (typeof rawText !== 'string') {
        return (typeof rawText === 'object' && rawText !== null) ? JSON.stringify(rawText) : "";
    }

    return rawText.replace(
        /<<if\s+\$(\w+)\s+is\s+"([^"]+)"\s*>>([\s\S]*?)(?:<<elseif\s+\$\1\s+is\s+"([^"]+)"\s*>>([\s\S]*?))?(?:<<else>>([\s\S]*?))?<<\/if>>/g,
        (match, variable, ifVal, ifText, elseifVal, elseifText, elseText) => {
            const current = getVar(variable);

            if (current === ifVal) return ifText.trim();
            if (elseifVal && current === elseifVal) return elseifText.trim();
            if (elseText) return elseText.trim();
            return "";
        }
    );
}

// Does a required value (string or array of strings) match what the player has?
function valueMatches(required, actual) {
    const current = String(actual ?? "").trim().toLowerCase();
    const options = Array.isArray(required) ? required : [required];
    return options.some(option => String(option).trim().toLowerCase() === current);
}

// A variant block shows only if every condition it defines is met
const VARIANT_CONDITIONS = ['temperament', 'familyOrigin', 'identity', 'homeLI_relation', 'previousNode'];

function variantMatches(block) {
    return VARIANT_CONDITIONS.every(key =>
        block[key] === undefined || valueMatches(block[key], getVar(key))
    );
}

function buildNodeHTML(node) {
    // Text can be an array of blocks, or a plain string (older nodes)
    const blocks = Array.isArray(node.text)
        ? node.text
        : [{ type: 'narrative', content: node.text || node.body || "" }];

    return blocks
        .filter(block =>
            block.type === 'narrative' ||
            ((block.type === 'narrative_variant' || block.type === 'familyOrigin_variant') && variantMatches(block))
        )
        .map(block => {
            const cssClass = block.type === 'narrative' ? '' : ' class="variant-text"';
            const text = parseConditionals(block.content || "").replace(/\n\n/g, '<br><br>');
            return `<p${cssClass}>${text}</p>`;
        })
        .join('');
}

// ==========================================
// HUD & BACK BUTTON
// ==========================================
function renderStatsHUD() {
    const hud = $('stats-display');
    if (!hud) return;

    hud.innerHTML = Object.entries(gameState.stats)
        .map(([key, value]) => {
            const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
            return `<span class="stat-item">${label}: ${value}</span>`;
        })
        .join(' | ');
}

// Dropdown tracker: lists every variable and highlights anything that changed since the last scene
let lastTracked = null;

const escapeHTML = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderTracker() {
    const panel = $('tracker-content');
    if (!panel) return;

    // Anything on gameState that isn't a known field is a story variable (identity, temperament...)
    const { stats, flags, currentFile, currentNode, previousNode, previousView, ...variables } = gameState;

    const sections = {
        'Scene': {
            'File': currentFile,
            'Node': currentNode,
            'Previous node': previousNode || '—',
            'Scenes back available': history.length
        },
        'Stats': stats,
        'Flags': flags,
        'Variables': variables
    };

    const current = {};
    let html = '';

    for (const [title, entries] of Object.entries(sections)) {
        const rows = Object.entries(entries).map(([key, value]) => {
            const id = `${title}.${key}`;
            const text = String(value);
            current[id] = text;

            const changed = title !== 'Scene' && lastTracked && lastTracked[id] !== text;
            return `<tr class="${changed ? 'changed' : ''}"><td>${escapeHTML(key)}</td><td>${escapeHTML(text)}</td></tr>`;
        });

        html += `<h4>${title}</h4>`;
        html += rows.length
            ? `<table>${rows.join('')}</table>`
            : `<p class="tracker-empty">None yet</p>`;
    }

    lastTracked = current;
    panel.innerHTML = html;
}

function updateBackButton() {
    $('step-back-btn').classList.toggle('hidden', history.length === 0);
}

// ==========================================
// RENDERING A NODE
// ==========================================
// Draws the node on screen. Returns true on success, false if it couldn't be shown.
async function renderNode(nodeId) {
    try {
        const data = await fetchStory(gameState.currentFile);
        const node = getNodes(data)[nodeId];

        if (!node) {
            console.error(`Node "${nodeId}" not found in "${gameState.currentFile}"`);
            return false;
        }

        gameState.currentNode = nodeId;

        $('scene-title').innerText = node.title ? String(node.title).replace(/_/g, ' ') : '';
        $('story-text').innerHTML = buildNodeHTML(node);

        renderChoices(node);
        renderStatsHUD();
        renderTracker();
        updateBackButton();
        window.scrollTo(0, 0);
        return true;

    } catch (error) {
        console.error("Error in renderNode:", error);
        return false;
    }
}

function renderChoices(node) {
    const choicesBox = $('choices-box');
    choicesBox.innerHTML = "";

    (node.choices || []).forEach(choice => {
        // Hide choices whose variable condition doesn't match
        if (choice.condition) {
            const [condKey, condVal] = Object.entries(choice.condition)[0];
            const current = getVar(condKey);
            if (current && current !== condVal) return;
        }

        // Hide choices that need a flag the player doesn't have
        if (choice.requires_flag && !gameState.flags[choice.requires_flag]) return;

        // Work out whether stat requirements lock this choice
        let lockReason = "";
        for (const [req, limit] of Object.entries(choice.requirements || {})) {
            const statName = req.replace(/^(min|max)_/, '');
            const value = gameState.stats[statName] || 0;

            if (req.startsWith('min_') && value < limit) lockReason += ` [Req: ${limit} ${statName}]`;
            if (req.startsWith('max_') && value > limit) lockReason += ` [Max: ${limit} ${statName}]`;
        }

        const btn = document.createElement('button');
        btn.innerText = choice.text + lockReason;

        if (lockReason) {
            btn.disabled = true;
            btn.classList.add('locked-choice');
        } else {
            btn.onclick = () => makeChoice(choice);
        }

        choicesBox.appendChild(btn);
    });
}

// ==========================================
// NAVIGATION
// ==========================================
function applyEffects(effects = {}) {
    for (const [key, value] of Object.entries(effects)) {
        const current = gameState.stats[key];
        // Numbers add up; text values (identity, temperament...) are simply set
        gameState.stats[key] = (typeof value === 'number' && typeof current === 'number')
            ? current + value
            : value;
    }
}

async function makeChoice(choice) {
    // Save the state BEFORE the choice so "Previous scene" can restore it exactly
    history.push(structuredClone(gameState));

    applyEffects(choice.effects);
    Object.assign(gameState.flags, choice.flags);

    gameState.previousNode = gameState.currentNode;
    if (choice.next_file) gameState.currentFile = choice.next_file;

    const success = await renderNode(choice.target || choice.next_node);

    // If the next node couldn't load, undo everything we just changed
    if (!success) gameState = history.pop();
}

async function goBack() {
    if (history.length === 0) return;

    // Restoring the snapshot also rolls back stats, flags and variables
    gameState = history.pop();
    await renderNode(gameState.currentNode);
}

// ==========================================
// INIT
// ==========================================
window.onload = () => {
    $('password-modal').classList.add('hidden');
    showView('homepage-container');
};

// ==========================================
// DEVELOPER TOOL: State Inspector (Ctrl+M or Ctrl+Shift+I)
// ==========================================
document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (!event.ctrlKey || !(key === 'm' || (event.shiftKey && key === 'i'))) return;

    event.preventDefault();
    console.clear();
    console.log("%c === CURRENT GAME STATE ===", "color: #00ffcc; font-weight: bold; font-size: 14px;");
    console.log("Raw Object:", gameState);
    console.table(gameState);
    console.log(`History depth: ${history.length}`);
});