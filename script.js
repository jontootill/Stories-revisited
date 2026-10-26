// Global State Tracker (Clean baseline for any story)
let gameState = {
    stats: {},         // Dynamic stats container
    flags: {},         // Story flags
    currentFile: '',   // Currently loaded act JSON file
    previousView: 'home'
};

function openPasswordModal() {
    document.getElementById('password-modal').classList.remove('hidden');
    document.getElementById('genre-password').value = "";
    document.getElementById('password-error').innerText = "";
}

function closePasswordModal() {
    document.getElementById('password-modal').classList.add('hidden');
}

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

function openGenreLibrary(genre) {
    document.getElementById('homepage-container').classList.add('hidden');
    
    if (genre === 'historical') {
        document.getElementById('historical-library-container').classList.remove('hidden');
    } else if (genre === 'fantasy') {
        document.getElementById('fantasy-library-container').classList.remove('hidden');
    }
}

function startGenre(genre) {
    if (genre === 'romance') {
        openPasswordModal();
    }
}

// Universal story starter - reads custom initial states and variables from story JSON
async function startStory(startFile, originView = 'historical') {
    gameState.previousView = originView;

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

    document.getElementById('homepage-container').classList.add('hidden');
    document.getElementById('historical-library-container').classList.add('hidden');
    document.getElementById('fantasy-library-container').classList.add('hidden');
    const romanceLib = document.getElementById('romance-library-container');
    if (romanceLib) romanceLib.classList.add('hidden');
    
    document.getElementById('game-container').classList.remove('hidden');

    // Reset game state for a fresh playthrough
    gameState.flags = {};
    gameState.stats = {};
    gameState.identity = "";
    gameState.familyOrigin = "";
    gameState.currentFile = startFile;

    try {
        let response = await fetch(startFile);
        if (!response.ok) throw new Error(`Failed to load ${startFile}`);
        let data = await response.json();

        // Load custom initial variables from JSON if defined
        if (data.initial_variables) {
            for (let [key, val] of Object.entries(data.initial_variables)) {
                gameState[key] = val;
            }
        }

        // Load initial stats from JSON if defined
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

function parseConditionals(rawText) {
    return rawText.replace(/<<if\s+\$(\w+)\s+is\s+"([^"]+)"\s*>>([\s\S]*?)(?:<<elseif\s+\$\1\s+is\s+"([^"]+)"\s*>>([\s\S]*?))?(?:<<else>>([\s\S]*?))?<<\/if>>/g, 
    (match, variable, ifVal, ifText, elseifVal, elseifText, elseText) => {
        let currentVal = gameState[variable];

        if (currentVal === ifVal) {
            return ifText.trim();
        } else if (elseifVal && currentVal === elseifVal) {
            return elseifText.trim();
        } else if (elseText) {
            return elseText.trim();
        }
        return ""; 
    });
}

// ==========================================
// UTILITY: Text & Variant Parsing
// ==========================================
function renderNodeText(nodeData) {
    let outputHTML = "";

    if (Array.isArray(nodeData.text)) {
        nodeData.text.forEach(block => {
            if (block.type === "narrative") {
                outputHTML += `<p>${block.content.replace(/\n\n/g, '</p><p>')}</p>`;
            } 
            else if (block.type === "familyOrigin_variant") {
                // Check against engine's current state (case-insensitive fallback)
                const currentState = gameState.familyOrigin || gameState.familyorigin;
                if (block.familyOrigin === currentState) {
                    outputHTML += `<p class="variant-text">${block.content.replace(/\n\n/g, '</p><p>')}</p>`;
                }
            }
            else if (block.type === "homeLI_relation_variant") {
                // Check against engine's current state (case-insensitive fallback)
                const currentState = gameState.homeLI_relation || gameState.homeLI_relation;
                if (block.homeLI_relation === currentState) {
                    outputHTML += `<p class="variant-text">${block.content.replace(/\n\n/g, '</p><p>')}</p>`;
                }
            }
            // Add extra types here as your story grows (e.g., identity_variant, temperament_variant)
        });
    } else if (typeof nodeData.text === "string") {
        // Fallback for older single-string node passages
        outputHTML += `<p>${nodeData.text.replace(/\n\n/g, '</p><p>')}</p>`;
    }

    return outputHTML;
}


async function loadNode(nodeId, actFile) {
    if (actFile) {
        gameState.currentFile = actFile;
    }

    try {
        let response = await fetch(gameState.currentFile);
        if (!response.ok) throw new Error(`Failed to load ${gameState.currentFile}`);
        
        let data = await response.json();
        let nodeCollection = data.nodes ? data.nodes : data;
        let currentNode = nodeCollection[nodeId];

        window.scrollTo(0, 0);

        if (!currentNode) {
            console.error(`Node "${nodeId}" not found in "${gameState.currentFile}"`);
            return;
        }

        // Render Story Title
        const titleElem = document.getElementById('scene-title');
        if (titleElem) {
            titleElem.innerText = currentNode.title ? String(currentNode.title).replace(/_/g, ' ') : '';
        }

// Render Story Text & Parse Variants / <<if>> Conditionals
        const textElem = document.getElementById('story-text') || document.getElementById('scene-text');
        if (textElem) {
            let renderedHTML = "";

            // Check if currentNode.text is an array (your new structured format)
            if (Array.isArray(currentNode.text)) {
                currentNode.text.forEach(block => {
                    if (block.type === "narrative") {
                        // Process narrative blocks normally
                        let parsed = parseConditionals(block.content || "");
                        renderedHTML += `<p>${parsed.replace(/\n\n/g, '<br><br>')}</p>`;
                    } 
                    else if (block.type === "familyOrigin_variant") {
                        // Only render if the player's familyOrigin matches this block
                        const currentOrigin = gameState.familyOrigin || gameState.familyorigin || "";
                        if (block.familyOrigin === currentOrigin) {
                            let parsed = parseConditionals(block.content || "");
                            renderedHTML += `<p class="variant-text">${parsed.replace(/\n\n/g, '<br><br>')}</p>`;
                        }
                    }
                });
            } else {
                // Fallback for older nodes that still use a plain string
                let rawText = currentNode.text || currentNode.body || ""; 
                let processedText = parseConditionals(rawText);
                renderedHTML = `<p>${processedText.replace(/\n\n/g, '<br><br>')}</p>`;
            }

            textElem.innerHTML = renderedHTML;
        }
        
        // Render Choices
        let choicesBox = document.getElementById('choices-box');
        choicesBox.innerHTML = "";

        if (currentNode.choices && currentNode.choices.length > 0) {
            currentNode.choices.forEach(choice => {
                
                if (choice.condition) {
                    let [condKey, condVal] = Object.entries(choice.condition)[0];
                    if (gameState[condKey] && gameState[condKey] !== condVal) {
                        return; 
                    }
                }

                if (choice.requires_flag && !gameState.flags[choice.requires_flag]) {
                    return;
                }

                let btn = document.createElement('button');
                let isLocked = false;
                let lockReason = "";

                if (choice.requirements) {
                    for (let [reqStat, limitVal] of Object.entries(choice.requirements)) {
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

function makeChoice(choice) {
    if (choice.effects) {
        for (let [statKey, changeValue] of Object.entries(choice.effects)) {
            if (statKey === 'familyorigin') {
                gameState.familyOrigin = changeValue;
            } else if (statKey === 'identity') {
                gameState.identity = changeValue;
            }

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
    loadNode(choice.target || choice.next_node, nextFile);
}

// Unlocks / Story Selectors (Triad and others remain open)
function updateStoryUnlocks() {
    const triadBtn = document.getElementById('btn-triad');
    const triadLockIcon = document.getElementById('triad-lock-icon');
    const triadDesc = document.getElementById('triad-desc');

    if (triadBtn) {
        triadBtn.classList.remove('locked-story');
        if (triadLockIcon) triadLockIcon.innerText = "✨";
        if (triadDesc) triadDesc.innerText = "The sequel: Crossing the threshold together.";
    }
}

function selectAshAndBoneStory() {
    startStory('data/romance/The Binding of Ash and Bone/Act 1.json', 'romance'); 
}

function selectTriadStory() {
    startStory('data/romance/triad/act1.json', 'romance');
}

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

// ==========================================
// DEVELOPER TOOL: State Inspector Shortcut
// ==========================================
document.addEventListener('keydown', function(event) {
    // Supports Ctrl+M OR Ctrl+Shift+I
    if ((event.ctrlKey && (event.key === 'm' || event.key === 'M')) || 
        (event.ctrlKey && event.shiftKey && (event.key === 'i' || event.key === 'I'))) {
        
        event.preventDefault();
        
        console.clear(); // Clears previous clutter
        console.log("%c === CURRENT GAME STATE ===", "color: #00ffcc; font-weight: bold; font-size: 14px;");
        
        if (typeof gameState !== 'undefined') {
            console.log("Raw Object:", gameState);
            console.table(gameState);
        } else {
            console.error("`gameState` object is undefined! Check how your state variable is named in script.js.");
        }
    }
});