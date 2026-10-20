
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
    const ROMANCE_PASSWORD = "261213"; // Replace with your actual password
    
    if (inputPassword === ROMANCE_PASSWORD) {
        closePasswordModal();
        
        // Both elements must exist in index.html for this to work without errors
        document.getElementById('homepage-container').classList.add('hidden');
        document.getElementById('romance-library-container').classList.remove('hidden');
    } else {
        document.getElementById('password-error').innerText = "Incorrect password. Try again.";
    }
}

function restartGame() {
    gameState.heat = 0;
    gameState.heart = 0;
    gameState.inhibition = 50;
    gameState.flags = {};
}

function startGenre(genre) {
    if (genre === 'sci-fi') {
        startStory('data/historical/act1.json');
    } else if (genre === 'fantasy') {
        startStory('data/fantasy/act1.json');
    } else if (genre === 'romance') {
        // Trigger the password modal instead of opening directly!
        openPasswordModal();
    }
}

function startStory(startFile) {
    // Hide BOTH the main homepage AND the romance sub-library
    document.getElementById('homepage-container').classList.add('hidden');
    document.getElementById('romance-library-container').classList.add('hidden');
    
    // Reveal the clean game reader view
    document.getElementById('game-container').classList.remove('hidden');
    
    // Reset state & load story
    restartGame();
    loadNode('node_1_1', startFile);
}

function returnToHome() {
    // Hide game view and sub-library
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('romance-library-container').classList.add('hidden');
    
    // Return to main light homepage
    document.getElementById('homepage-container').classList.remove('hidden');
}

window.onload = () => {
    // Ensure everything starts clean on the main homepage
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('romance-library-container').classList.add('hidden');
    document.getElementById('password-modal').classList.add('hidden');
    document.getElementById('homepage-container').classList.remove('hidden');
};

let gameState = {
    heat: 0,
    heart: 0,
    inhibition: 50,
    flags: {},
    currentFile: 'data/romance/window/act1.json'
};

// Function to load a node from a JSON file
async function loadNode(nodeId, actFile) {
    if (actFile) {
        gameState.currentFile = actFile;
    }

    // --- CHECKPOINT 1: ACT 3 STAT CHECK ---
    // If attempting to enter Act 3 without enough Heat or with too much Inhibition, end early safely.
if (gameState.currentFile === 'data/romance/window/act3.json' && nodeId === 'node_3_1') {
        if (gameState.heat < 300 || gameState.inhibition > 20) {
            resolveAct6Ending();
            return;
        }
    }

    // --- CHECKPOINT 2: ACT 4 STAT CHECK ---
    // Act 4 requires significant Heat to drop cover and turn the light on.
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
            // Hide choices requiring unearned flags
            if (choice.requires_flag && !gameState.flags[choice.requires_flag]) {
                return;
            }

            let btn = document.createElement('button');
            let isLocked = false;
            let lockReason = "";

            // Evaluate Stat Gates
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
                btn.classList.add('locked-choice'); // Use CSS to style (opacity, cursor: not-allowed)
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
        gameState.heat = Math.max(0, gameState.heat + (choice.effects.heat || 0));
        gameState.heart = Math.max(0, gameState.heart + (choice.effects.heart || 0));
        gameState.inhibition = Math.min(100, Math.max(0, gameState.inhibition + (choice.effects.inhibition || 0)));
    }
    
    if (choice.flags) {
        for (let flagKey in choice.flags) {
            gameState.flags[flagKey] = choice.flags[flagKey];
        }
    }

    // Refresh UI Display
    document.getElementById('stat-heat').innerText = gameState.heat;
    document.getElementById('stat-heart').innerText = gameState.heart;
    document.getElementById('stat-inhibition').innerText = gameState.inhibition;

    loadNode(choice.next_node, choice.next_file);
}

// --- EARLY SAFE ENDINGS ---
function triggerEarlyEnding(reason) {
    let storyBox = document.getElementById('story-text');
    let choicesBox = document.getElementById('choices-box');
    choicesBox.innerHTML = "";

    if (reason === "heat_too_low_act3") {
        storyBox.innerText = "--- EARLY ENDING: THE DRAWN BLINDS ---\n\nAs the weeks pass, your initial interest quietly fades. Without enough inner fire driving you to step into the dark, watching him feels increasingly meaningless. One evening, you firmly draw your heavy kitchen curtains shut, turn on your living room lamps, and go back to your quiet, comfortable life. You never look out across the courtyard again.";
    } else if (reason === "heat_too_low_act4") {
        storyBox.innerText = "--- EARLY ENDING: A DISTANT MEMORY ---\n\nYou stand in your dark kitchen with your hand resting on the light switch, but you simply cannot bring yourself to cross the line. The fear of exposure outweighs your desire. You step away from the glass for the last time, leaving him as nothing more than a passing, distant memory from a window across the square.";
    }

    // Add Restart Button
    let restartBtn = document.createElement('button');
    restartBtn.innerText = "Start Over";
    restartBtn.onclick = () => restartGame();
    choicesBox.appendChild(restartBtn);
}

// --- AUTOMATIC ACT 6 ENDING SELECTION ---
function resolveAct6Ending() {
    let choicesBox = document.getElementById('choices-box');
    choicesBox.innerHTML = "";

    // Inside resolveAct6Ending() or makeChoice() for the Triad ending:
if (gameState.flags["friend_involved"] && gameState.heat >= 400) {
    localStorage.setItem('triad_unlocked', 'true'); // <-- Saves permanent unlock state!
    loadNode('node_6_2_triad_encounter', 'data/romance/window/act6.json');
    return;
}

    // 2. Physical Threshold Ending (High Heat + Low Inhibition)
    if (gameState.heat >= 300 && gameState.inhibition <= 30) {
        loadNode('node_6_2_physical_threshold', 'data/romance/window/act6.json');
        return;
    }

    // 3. Glass Sanctuary Ending (Default resolution for lower Heat or higher Inhibition)
    loadNode('node_6_2_glass_sanctuary', 'data/romance/window/act6.json');
}

// Restart Function
function restartGame() {
    gameState = {
        heat: 0,
        heart: 0,
        inhibition: 50,
        flags: {},
        currentFile: 'data/romance/window/act1.json'
    };
    document.getElementById('stat-heat').innerText = gameState.heat;
    document.getElementById('stat-heart').innerText = gameState.heart;
    document.getElementById('stat-inhibition').innerText = gameState.inhibition;
    loadNode('node_1_1', 'data/romance/window/act1.json');
}

window.onload = () => {
    loadNode('node_1_1', 'data/romance/window/act1.json');
};

function startTriadStory() {
    if (localStorage.getItem('triad_unlocked') === 'true') {
        loadNode('node_1_1', 'data/romance/triad/act1.json');
    } else {
        document.getElementById('story-text').innerText = 
            "LOCKED: You must complete 'The Window' with the Shared Destiny (Triad) ending to unlock this sequel arc!";
        document.getElementById('choices-box').innerHTML = "";
    }
}