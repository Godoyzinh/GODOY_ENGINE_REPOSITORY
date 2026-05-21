==================================================
📐 CORE TECHNICAL PHILOSOPHY
==================================================

The engine must be:
- modular
- scalable
- AI-readable
- maintainable
- expandable
- decoupled

Every system must support:
- future multiplayer
- future procedural systems
- future studio tools
- future scripting integration

==================================================
📁 PROJECT STRUCTURE STANDARD
==================================================

src/

engine/
player/
world/
entities/
network/
ui/
audio/
save/
scripts/
physics/
tools/
assets/

==================================================
📦 MODULE RULES
==================================================

Each module must:
- have a single responsibility
- expose clean APIs
- avoid direct dependency chains
- avoid circular imports

GOOD:
world -> blocks

BAD:
world -> player -> ui -> world

==================================================
🧠 AI-READABLE CODE RULES
==================================================

All code must be:
- explicit
- readable
- descriptive
- commented when necessary

Avoid:
- cryptic variables
- compressed logic
- giant functions
- hidden side effects

==================================================
📛 NAMING CONVENTIONS
==================================================

FILES:
camelCase.js

EXAMPLES:
playerMovement.js
terrainGenerator.js

CLASSES:
PascalCase

EXAMPLE:
class TerrainGenerator

VARIABLES:
camelCase

CONSTANTS:
UPPER_CASE

==================================================
🧱 ENTITY ARCHITECTURE
==================================================

Every entity must contain:

- transform
- renderer
- collider
- state
- update()

EXAMPLE:

entity.update(deltaTime)

==================================================
⚡ GAME LOOP STANDARD
==================================================

The engine loop must separate:

1. input
2. simulation
3. physics
4. rendering
5. UI update

==================================================
🌎 WORLD SYSTEM RULES
==================================================

World generation must:
- support chunk loading
- support async generation
- support biome expansion

Chunks must:
- load independently
- unload independently
- cache safely

==================================================
📦 BLOCK SYSTEM STANDARD
==================================================

Each block must contain:

{
    id,
    name,
    material,
    texture,
    hardness,
    collision,
    transparent
}

==================================================
🎮 PLAYER SYSTEM STANDARD
==================================================

Player controller must support:

- first person
- third person
- freecam
- creative mode
- multiplayer replication

==================================================
⚙️ PHYSICS STANDARD
==================================================

Physics layer must be separated from rendering.

Physics responsibilities:
- collisions
- gravity
- movement validation
- rigid bodies

==================================================
🌐 NETWORK STANDARD
==================================================

Networking must be:

authoritative server based

Client responsibilities:
- rendering
- prediction
- interpolation

Server responsibilities:
- validation
- world authority
- player authority

==================================================
🖥️ UI STANDARD
==================================================

UI must:
- be modular
- support themes
- support responsive scaling

UI systems:
- HUD
- menus
- inventory
- studio tools

==================================================
💾 SAVE SYSTEM STANDARD
==================================================

Save format:
JSON-based initially

Future:
binary chunk compression

Save types:
- world
- player
- settings

==================================================
🛠️ TOOL SYSTEM STANDARD
==================================================

Studio tools must support:

- move
- rotate
- scale
- duplicate
- delete
- undo/redo

==================================================
📜 SCRIPTING STANDARD
==================================================

Scripts must:
- run sandboxed
- never access engine internals directly
- use exposed APIs only

==================================================
🎨 RENDERING STANDARD
==================================================

Renderer pipeline:
- shadows
- ambient light
- directional light
- fog
- postprocessing

Future:
- SSAO
- bloom
- volumetrics

==================================================
📈 OPTIMIZATION STANDARD
==================================================

Required systems:
- chunk culling
- frustum culling
- instancing
- LOD
- async generation

==================================================
🚫 FORBIDDEN PRACTICES
==================================================

NEVER:
- giant monolithic files
- duplicated systems
- hardcoded dependencies
- direct DOM logic in engine core
- rewrite working architecture unnecessarily

==================================================
🤖 AI AGENT DEVELOPMENT RULES
==================================================

AI agents must:

- preserve architecture
- avoid breaking APIs
- maintain modularity
- document major systems
- avoid destructive rewrites

When expanding systems:
- extend
- never replace blindly

==================================================
🔥 ENGINE GOAL
==================================================

The engine should evolve into:

- sandbox platform
- multiplayer ecosystem
- AI-assisted creation platform
- studio environment
- publishable game platform

Codename:
GODOY ENGINE
