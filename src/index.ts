import { setupGame } from './game'
import { setupHud } from './hud'

export function main() {
  // Boss fight state machine, attacks, projectiles, shards.
  setupGame()
  // HUD: boss HP, player HP, timer, intro/victory/defeat panels.
  setupHud()
}
