let gameState = {
    stats: {},       // Dynamic stats container
    flags: {},       // Story flags
    currentFile: ''  // Currently loaded act JSON file
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
        
        // Refresh story locks when entering the Romance Library
        updateStoryUnlocks();
    } else {
        document.getElementById('password-error').innerText = "Incorrect password. Try again.";
    }
}

function startGenre(genre) {
    if (genre === 'sci-fi' || genre === 'historical') {
        startStory('data/historical/act1.json');
    } else if (genre === 'fantasy') {
        startStory('data/fantasy/act1.json');
    } else if (genre === 'romance') {
        openPasswordModal();
    }
}

async function startStory(startFile) {
    // Hide libraries and reveal game reader view
    document.getElementById('homepage-container').classList.add('hidden');
    document.getElementById('romance-library-container').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');

    // Reset flags and current file path
    gameState.flags = {};
    gameState.stats = {};
    gameState.currentFile = startFile;

    try {
        let response = await fetch(startFile);
        if (!response.ok) throw new Error(`Failed to load ${startFile}`);
        let data = await response.json();

        // 1. Load starting stats dynamically if defined in Act 1 JSON
        if (data.initial_stats) {
            gameState.stats = { ...data.initial_stats };
        }

        // 2. Render dynamic HUD stats bar
        renderStatsHUD();

        // 3. Load starting node using the specific story file path passed in!
        loadNode('node_1_1', startFile);

    } catch (error) {
        console.error("Error starting story:", error);
    }
}

function renderStatsHUD() {
    let statsDisplay = document.getElementById('stats-display');
    if (!statsDisplay) return;

    let statPairs = [];
    for (let [key, value] of Object.entries(gameState.stats)) {
        let formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
        statPairs.push(`${formattedKey}: <span id="stat-${key}">${value}</span>`);
    }

    statsDisplay.innerHTML = statPairs.join(' | ');
}

function updateStatsDisplay() {
    for (let [key, value] of Object.entries(gameState.stats)) {
        let el = document.getElementById(`stat-${key}`);
        if (el) el.innerText = value;
    }
}

function returnToHome() {
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('romance-library-container').classList.add('hidden');
    document.getElementById('homepage-container').classList.remove('hidden');
}

// Returns from active game reader back to the Romance Sub-Library
function returnToRomanceLibrary() {
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('homepage-container').classList.add('hidden');
    document.getElementById('romance-library-container').classList.remove('hidden');
    updateStoryUnlocks();
}

// Function to load a node from a JSON file
async function loadNode(nodeId, actFile) {
    if (actFile) {
        gameState.currentFile = actFile;
    }

    // --- CHECKPOINT 1: ACT 3 STAT CHECK ---
    if (gameState.currentFile === 'data/romance/window/act3.json' && nodeId === 'node_3_1') {
        if (gameState.heat < 300 || gameState.inhibition > 20) {
            resolveAct6Ending();
            return;
        }
    }

    // --- CHECKPOINT 2: ACT 4 STAT CHECK ---
    if (gameState.currentFile === 'data/romance/window/act4.json' && nodeId === 'node_4_1') {
        if (gameState.heat < 400) {
            resolveAct6Ending();
            return;
        }
    }

    // --- CHECKPOINT 3: AUTOMATIC ACT 6 ENDING SELECTION ---
    if (gameState.currentFile === 'data/romance/window/act6.json' && nodeId === 'node_6_1') {
        resolveAct6Ending();
        return;
    }

    try {
        let response = await fetch(gameState.currentFile);
        if (!response.ok) throw new Error(`Failed to load ${gameState.currentFile}`);
        
        let data = await response.json();
        let currentNode = data.nodes[nodeId];

        if (!currentNode) {
            console.error(`Node "${nodeId}" not found in "${gameState.currentFile}"`);
            return;
        }

        // Render Story Text
        document.getElementById('story-text').innerText = currentNode.text;
        
        // Render Choices
        let choicesBox = document.getElementById('choices-box');
        choicesBox.innerHTML = "";

        currentNode.choices.forEach(choice => {
            if (choice.requires_flag && !gameState.flags[choice.requires_flag]) {
                return;
            }

            let btn = document.createElement('button');
            let isLocked = false;
            let lockReason = "";

            if (choice.min_heat && gameState.heat < choice.min_heat) {
                isLocked = true;
                lockReason += ` [Req: ${choice.min_heat} Heat]`;
            }
            if (choice.max_inhibition && gameState.inhibition > choice.max_inhibition) {
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

    } catch (error) {
        console.error("Error in loadNode:", error);
    }
}

// Handle player choice execution
function makeChoice(choice) {
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

    if (choice.flags) {
        for (let key in choice.flags) {
            gameState.flags[key] = choice.flags[key];
        }
    }

    let nextFile = choice.next_file || gameState.currentFile;
    loadNode(choice.next_node, nextFile);
}

// --- AUTOMATIC ACT 6 ENDING SELECTION ---
function resolveAct6Ending() {
    let choicesBox = document.getElementById('choices-box');
    choicesBox.innerHTML = "";

    // Mark 'The Window' as completed so the Triad sequel unlocks!
    localStorage.setItem('window_completed', 'true');

    if (gameState.flags["friend_involved"] && gameState.heat >= 400) {
        localStorage.setItem('triad_unlocked', 'true');
        loadNode('node_6_2_triad_encounter', 'data/romance/window/act6.json');
        return;
    }

    if (gameState.heat >= 300 && gameState.inhibition <= 30) {
        loadNode('node_6_2_physical_threshold', 'data/romance/window/act6.json');
        return;
    }

    loadNode('node_6_2_glass_sanctuary', 'data/romance/window/act6.json');
}

// Function to update the Romance Sub-Library menu based on completion status
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

// Handler for when the user clicks The Triad Arc button
function selectTriadStory() {
    const isCompleted = localStorage.getItem('window_completed') === 'true';

    if (isCompleted) {
        startStory('data/romance/triad/act1.json');
    } else {
        alert("The Triad Arc is locked! You must complete 'The Window' first to unlock this sequel.");
    }
}

// Single clean window.onload setup
window.onload = () => {
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('romance-library-container').classList.add('hidden');
    document.getElementById('password-modal').classList.add('hidden');
    document.getElementById('homepage-container').classList.remove('hidden');

    updateStoryUnlocks();
};