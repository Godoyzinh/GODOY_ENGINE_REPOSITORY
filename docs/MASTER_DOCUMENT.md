PROJECT NAME:
Godoy Studio

PROJECT TYPE:
AI-native sandbox game platform

CORE IDEA:
Um jogo/plataforma sandbox totalmente desenvolvido por IAs,
com supervisão humana mínima.

O usuário atua como:
- diretor criativo
- playtester
- aprovador

As IAs atuam como:
- programadores
- arquitetos
- designers
- game designers
- system designers
- technical artists

==================================================
🎯 PRIMARY OBJECTIVE
==================================================

Criar uma plataforma estilo:
- Roblox
- Minecraft
- Garry's Mod
- Core
- Rec Room

Porém:
- web-based
- modular
- procedural
- AI-assisted
- expansível infinitamente

==================================================
🧠 DEVELOPMENT PHILOSOPHY
==================================================

1. Modularidade acima de tudo
Nada deve depender diretamente de outro sistema.

2. Escalabilidade obrigatória
Tudo deve suportar expansão futura.

3. IA-first development
O código deve ser facilmente compreendido por outras IAs.

4. Reutilização máxima
Sistemas devem ser reutilizáveis.

5. Performance progressiva
Primeiro funcionalidade.
Depois otimização.

==================================================
🧱 ENGINE ARCHITECTURE
==================================================

/engine
    renderer
    scene
    camera
    lighting
    postprocessing

/player
    movement
    controls
    animation
    inventory
    stats

/world
    terrain
    chunks
    generation
    biomeSystem
    weather

/entities
    npcs
    enemies
    animals
    vehicles

/building
    placement
    destruction
    editing
    voxelTools

/network
    multiplayer
    sync
    prediction
    server

/ui
    hud
    menus
    inventoryUI
    studioUI

/audio
    music
    ambient
    sfx

/save
    serialization
    worldSave
    playerSave

/scripts
    luaLikeSystem
    triggers
    events

==================================================
🌎 WORLD SYSTEM
==================================================

WORLD TYPE:
Procedural voxel sandbox.

FEATURES:
- infinite terrain
- chunk loading
- biomes
- caves
- oceans
- mountains
- structures

CHUNK SIZE:
16x16

WORLD GENERATION:
Perlin/Simplex Noise

==================================================
🎮 GAMEPLAY LOOP
==================================================

1. Spawn
2. Explore
3. Build
4. Collect resources
5. Create worlds
6. Share worlds
7. Multiplayer interaction
8. Script experiences
9. Publish games

==================================================
🏗️ BUILDING SYSTEM
==================================================

CORE FEATURES:
- place blocks
- remove blocks
- rotate objects
- scale objects
- duplicate objects
- copy/paste structures

ADVANCED:
- voxel editing
- terrain sculpting
- prefab system

==================================================
👤 PLAYER SYSTEM
==================================================

MOVEMENT:
- walk
- sprint
- jump
- crouch
- swim
- fly (creative)

CAMERA:
- first person
- third person
- freecam studio mode

==================================================
📦 INVENTORY SYSTEM
==================================================

FEATURES:
- hotbar
- drag/drop
- stack system
- equipment
- tools
- consumables

==================================================
⚡ PHYSICS
==================================================

INITIAL:
Simple collisions

FUTURE:
- rigid bodies
- destruction physics
- vehicle physics
- ragdoll

==================================================
🌐 MULTIPLAYER
==================================================

STACK:
- Node.js
- Socket.io
- authoritative server

FEATURES:
- lobbies
- dedicated servers
- world sync
- player sync
- chat
- friends

==================================================
🧠 AI NPC SYSTEM
==================================================

NPC TYPES:
- villagers
- enemies
- traders
- animals

FUTURE:
LLM-driven NPC behavior

==================================================
🎨 VISUAL STYLE
==================================================

STYLE:
Stylized semi-lowpoly.

REFERENCE:
- Roblox
- Fortnite Creative
- Minecraft Legends

==================================================
🔊 AUDIO
==================================================

- adaptive ambient music
- biome sounds
- positional audio

==================================================
🛠️ STUDIO MODE
==================================================

A Roblox Studio inside the game.

FEATURES:
- move tool
- rotate tool
- scale tool
- hierarchy
- asset browser
- script editor
- test mode

==================================================
📜 SCRIPTING SYSTEM
==================================================

LANGUAGE:
Lua-inspired scripting

EXAMPLE:

part.onTouch(function(player)
{
    player.health -= 10;
});

==================================================
📈 DEVELOPMENT PHASES
==================================================

PHASE 1:
Foundation
- renderer
- player
- terrain
- blocks

PHASE 2:
Core Gameplay
- inventory
- tools
- save system

PHASE 3:
World Expansion
- procedural generation
- chunks
- caves

PHASE 4:
Studio Tools
- editing
- object manipulation

PHASE 5:
Multiplayer

PHASE 6:
Publishing Platform

==================================================
🤖 AI WORKFLOW
==================================================

ChatGPT:
- architecture
- systems
- logic
- debugging
- design

Other AI Agents:
- implementation
- UI
- assets
- optimization

Human:
- approval
- testing
- creative direction

==================================================
🚫 RULES
==================================================

- Never rewrite working systems unnecessarily.
- Maintain modularity.
- Maintain readability.
- Maintain AI-readable architecture.
- Avoid spaghetti code.
- Prioritize scalability.
- Every feature must support future expansion.

==================================================
🔥 LONG TERM GOAL
==================================================

Create a fully AI-developed sandbox gaming ecosystem
capable of hosting user-generated experiences.

Codename:
GODOY ENGINE
