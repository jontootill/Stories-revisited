// Global State Tracker
let gameState = {
    stats: {},         // Dynamic stats container (e.g., fatigue, heat, witanLoyalty)
    flags: {},         // Story flags
    currentFile: ''    // Currently loaded act JSON file
};

function openPasswordModal() {
    document.getElementById('password-modal').classList.remove('hidden');
    document.getElementById('genre-password').value = "";
    document.getElementById('password-error').innerText = "";
}

function closePasswordModal() {
    document.getElementById('password-modal').classList.add('hidden');
}

// Called when the user clicks "Submit" in the password modal
function unlockRomance() {
    let inputPassword = document.getElementById('genre-password').value;
    const ROMANCE_PASSWORD = "261213"; 
    
    if (inputPassword === ROMANCE_PASSWORD) {
        closePasswordModal();
        document.getElementById('homepage-container').classList.add('hidden');
        document.getElementById('romance-library-container').classList.remove('hidden');
        updateStoryUnlocks();
    } else {
        document.getElementById('password-error').innerText = "Incorrect password. Try again.";
    }
}

// Add origin variable to state tracker
gameState.previousView = 'home'; // Default fallback


// Opens a specific genre's sub-library page
function openGenreLibrary(genre) {
    document.getElementById('homepage-container').classList.add('hidden');
    
    if (genre === 'historical') {
        document.getElementById('historical-library-container').classList.remove('hidden');
    } else if (genre === 'fantasy') {
        document.getElementById('fantasy-library-container').classList.remove('hidden');
    }
}
// Handles genre button clicks from homepage
function startGenre(genre) {
    if (genre === 'romance') {
        openPasswordModal();
    }
}

// Updated startStory to accept and remember origin view
async function startStory(startFile, originView = 'historical') {
    gameState.previousView = originView;

    // Dynamically update the back button text based on source library
    const backBtn = document.getElementById('back-to-library-btn');
    if (backBtn) {
        if (originView === 'historical') {
            backBtn.innerText = "← Back to Historical Library";
        } else if (originView === 'fantasy') {
            backBtn.innerText = "← Back to Fantasy Library";
        } else if (originView === 'romance') {
            backBtn.innerText = "← Back to Romance Library";
        }
    }

    // Hide all libraries and reveal game view
    document.getElementById('homepage-container').classList.add('hidden');
    document.getElementById('historical-library-container').classList.add('hidden');
    document.getElementById('fantasy-library-container').classList.add('hidden');
    const romanceLib = document.getElementById('romance-library-container');
    if (romanceLib) romanceLib.classList.add('hidden');
    
    document.getElementById('game-container').classList.remove('hidden');

    // Reset game state
    gameState.flags = {};
    gameState.stats = {};
    gameState.currentFile = startFile;

    try {
        let response = await fetch(startFile);
        if (!response.ok) throw new Error(`Failed to load ${startFile}`);
        let data = await response.json();

        if (data.initial_stats) {
            gameState.stats = { ...data.initial_stats };
        }

        renderStatsHUD();

        let startNodeKey = data.start_node || (data.nodes ? Object.keys(data.nodes)[0] : Object.keys(data)[0]);
        loadNode(startNodeKey, startFile);

    } catch (error) {
        console.error("Error starting story:", error);
    }
}

// Smart back button returns to the exact genre sub-library the user came from
function smartBack() {
    document.getElementById('game-container').classList.add('hidden');
    
    if (gameState.previousView === 'historical') {
        document.getElementById('historical-library-container').classList.remove('hidden');
    } else if (gameState.previousView === 'fantasy') {
        document.getElementById('fantasy-library-container').classList.remove('hidden');
    } else if (gameState.previousView === 'romance') {
        document.getElementById('romance-library-container').classList.remove('hidden');
    } else {
        document.getElementById('homepage-container').classList.remove('hidden');
    }
}

function renderStatsHUD() {
    let statsDisplay = document.getElementById('stats-display') || document.getElementById('stats-bar');
    if (!statsDisplay) return;

    let statPairs = [];
    for (let [key, value] of Object.entries(gameState.stats)) {
        let formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
        statPairs.push(`<span class="stat-item">${formattedKey}: <span id="stat-${key}">${value}</span></span>`);
    }

    statsDisplay.innerHTML = statPairs.join(' | ');
}

function updateStatsDisplay() {
    for (let [key, value] of Object.entries(gameState.stats)) {
        let el = document.getElementById(`stat-${key}`);
        if (el) el.innerText = value;
    }
}

// Returns to the root homepage
function returnToHome() {
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('historical-library-container').classList.add('hidden');
    document.getElementById('fantasy-library-container').classList.add('hidden');
    const romanceLib = document.getElementById('romance-library-container');
    if (romanceLib) romanceLib.classList.add('hidden');
    
    document.getElementById('homepage-container').classList.remove('hidden');
}

function returnToRomanceLibrary() {
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('homepage-container').classList.add('hidden');
    const romanceLib = document.getElementById('romance-library-container');
    if (romanceLib) romanceLib.classList.remove('hidden');
    updateStoryUnlocks();
}

// Universal node loader supporting single-file JSON maps or multi-act structures
async function loadNode(nodeId, actFile) {
    if (actFile) {
        gameState.currentFile = actFile;
    }

    try {
        let response = await fetch(gameState.currentFile);
        if (!response.ok) throw new Error(`Failed to load ${gameState.currentFile}`);
        
        let data = await response.json();
        
        // Supports both structured { nodes: { ... } } formats and flat JSON passage maps
        let nodeCollection = data.nodes ? data.nodes : data;
        let currentNode = nodeCollection[nodeId];

        if (!currentNode) {
            console.error(`Node "${nodeId}" not found in "${gameState.currentFile}"`);
            return;
        }

        // Render Story Title & Text
        const titleElem = document.getElementById('scene-title');
        if (titleElem) titleElem.innerText = currentNode.title ? currentNode.title.replace(/_/g, ' ') : '';

        const textElem = document.getElementById('story-text') || document.getElementById('scene-text');
        if (textElem) {
            let cleanBody = currentNode.text
                .replace(/^#\s*/gm, '')
                .replace(/^\*\s*/gm, '')
                .replace(/\n\n/g, '<br><br>');
            textElem.innerHTML = cleanBody;
        }
        
        // Render Choices
        let choicesBox = document.getElementById('choices-box');
        choicesBox.innerHTML = "";

        if (currentNode.choices && currentNode.choices.length > 0) {
            currentNode.choices.forEach(choice => {
                // Flag requirement check
                if (choice.requires_flag && !gameState.flags[choice.requires_flag]) {
                    return;
                }

                let btn = document.createElement('button');
                let isLocked = false;
                let lockReason = "";

                // Dynamic generic stat requirement checking (e.g., min_heat, min_fatigue, max_inhibition)
                if (choice.requirements) {
                    for (let [reqStat, limitVal] of Object.entries(choice.requirements)) {
                        // Check if requirement is a minimum or maximum rule
                        if (reqStat.startsWith('min_')) {
                            let statName = reqStat.replace('min_', '');
                            if ((gameState.stats[statName] || 0) < limitVal) {
                                isLocked = true;
                                lockReason += ` [Req: ${limitVal} ${statName}]`;
                            }
                        } else if (reqStat.startsWith('max_')) {
                            let statName = reqStat.replace('max_', '');
                            if ((gameState.stats[statName] || 0) > limitVal) {
                                isLocked = true;
                                lockReason += ` [Max: ${limitVal} ${statName}]`;
                            }
                        }
                    }
                }

                // Legacy fallback checks for backward compatibility
                if (choice.min_heat && (gameState.stats.heat || 0) < choice.min_heat) {
                    isLocked = true;
                    lockReason += ` [Req: ${choice.min_heat} Heat]`;
                }
                if (choice.max_inhibition && (gameState.stats.inhibition || 0) > choice.max_inhibition) {
                    isLocked = true;
                    lockReason += ` [Max ${choice.max_inhibition} Inhibition]`;
                }

                if (isLocked) {
                    btn.innerText = choice.text + lockReason;
                    btn.disabled = true;
                    btn.classList.add('locked-choice');
                } else {
                    btn.innerText = choice.text;
                    btn.onclick = () => makeChoice(choice);
                }

                choicesBox.appendChild(btn);
            });
        }

    } catch (error) {
        console.error("Error in loadNode:", error);
    }
}

// Handle player choice execution
function makeChoice(choice) {
    // Apply stat changes dynamically
    if (choice.effects) {
        for (let [statKey, changeValue] of Object.entries(choice.effects)) {
            if (gameState.stats.hasOwnProperty(statKey)) {
                gameState.stats[statKey] += changeValue;
            } else {
                gameState.stats[statKey] = changeValue;
            }
        }
        updateStatsDisplay();
    }

    // Apply flags
    if (choice.flags) {
        for (let key in choice.flags) {
            gameState.flags[key] = choice.flags[key];
        }
    }

    let nextFile = choice.next_file || gameState.currentFile;
    loadNode(choice.target || choice.next_node, nextFile);
}

// Romance Unlock Checkers (Kept safe so your romance features continue to work)
function updateStoryUnlocks() {
    const isCompleted = localStorage.getItem('window_completed') === 'true';
    const triadBtn = document.getElementById('btn-triad');
    const triadLockIcon = document.getElementById('triad-lock-icon');
    const triadDesc = document.getElementById('triad-desc');

    if (triadBtn) {
        if (isCompleted) {
            triadBtn.classList.remove('locked-story');
            if (triadLockIcon) triadLockIcon.innerText = "✨";
            if (triadDesc) triadDesc.innerText = "The sequel: Crossing the threshold together.";
        } else {
            triadBtn.classList.add('locked-story');
            if (triadLockIcon) triadLockIcon.innerText = "🔒";
            if (triadDesc) triadDesc.innerText = "Complete 'The Window' to unlock this sequel.";
        }
    }
}

// Updated selectTriadStory helper
function selectTriadStory() {
    const isCompleted = localStorage.getItem('window_completed') === 'true';
    if (isCompleted) {
        startStory('data/romance/triad/act1.json', 'romance');
    } else {
        alert("The Triad Arc is locked! You must complete 'The Window' first to unlock this sequel.");
    }
}

// Window Onload Setup
window.onload = () => {
    const gameCont = document.getElementById('game-container');
    const romanceLib = document.getElementById('romance-library-container');
    const modal = document.getElementById('password-modal');
    const homeCont = document.getElementById('homepage-container');

    if (gameCont) gameCont.classList.add('hidden');
    if (romanceLib) romanceLib.classList.add('hidden');
    if (modal) modal.classList.add('hidden');
    if (homeCont) homeCont.classList.remove('hidden');

    updateStoryUnlocks();
};