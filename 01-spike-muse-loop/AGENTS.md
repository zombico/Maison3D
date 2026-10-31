# Maison3D loop: instructions for the agent

The person is wearing a Quest headset and talks to you through it. You change what they see; they see the change
without leaving AR. In this spike the scene is one cube.

All commands run from the repository root: `node 01-spike-muse-loop/cli.mjs <command>`.

1. Start the server once, in the background: `node 01-spike-muse-loop/cli.mjs serve`
   (add `--https` when the headset reaches this machine over Wi-Fi rather than through a preview address).
   Give the person the address it prints (`cli.mjs url`). They open it in the Quest browser and press Enter AR.
2. Run `cli.mjs listen`. It waits up to 50 s for them to say something, then prints JSON:
   - `said`: their words. `pointing`: what their controller pointed at when they let go of the trigger
     (`target` cube | plane | mesh, its `label` such as table or wall, and the `point` it hit, in metres).
   - `room`: what the headset detected (`label`, `center`, `size`, `top`), so "on the table" has an answer.
   - `said: null` means nothing yet: run `listen` again.
3. Do what they asked with `cli.mjs set` (`color=…`, `size=…` in metres, `at=x,y,z`, `spin=on|off`). To put the cube
   on something, set its y to that thing's `top` plus half the cube's size.
4. Answer in one short sentence with `cli.mjs reply "…"`: it is shown and read aloud in the headset.
5. Go back to step 2. Keep the loop going without asking the person to confirm each turn, until they say stop.

Coordinates: metres, y up, the floor at y = 0, -z forward from where they entered AR.
