// Coded React-ECS HUD for the Crystal Golem fight.
// Reads the shared hudState from game.ts every frame; buttons call
// startFight / resetFight. Kept in src/hud.tsx (not src/ui/) so the
// Creator Hub UI Designer never rewrites it.
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { hudState, startFight, resetFight } from './game'
import { formatTime } from './logic'

const BOSS_BAR_W = 480
const PLAYER_BAR_W = 200

export function setupHud() {
  ReactEcsRenderer.setUiRenderer(hudComponent, { virtualWidth: 1920, virtualHeight: 1080 })
}

const hudComponent = () => (
  <UiEntity
    uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}
  >
    {/* Boss HP bar, top-center */}
    <UiEntity
      uiTransform={{ width: 520, height: 66, margin: '16px 0 0 0', flexDirection: 'column', alignItems: 'center' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
    >
      <Label
        value="CRYSTAL GOLEM"
        fontSize={20}
        color={Color4.White()}
        textAlign="middle-center"
        uiTransform={{ width: 520, height: 26 }}
      />
      <UiEntity uiTransform={{ width: BOSS_BAR_W, height: 18, margin: '2px 0' }} uiBackground={{ color: Color4.create(0.15, 0.15, 0.15, 0.9) }}>
        <UiEntity
          uiTransform={{ width: Math.max(0, (BOSS_BAR_W * hudState.bossHp) / hudState.bossMax), height: 18 }}
          uiBackground={{ color: Color4.fromHexString('#ef4444') }}
        />
      </UiEntity>
      <Label
        value={`${hudState.bossHp} / ${hudState.bossMax}`}
        fontSize={14}
        color={Color4.create(1, 0.8, 0.8, 1)}
        textAlign="middle-center"
        uiTransform={{ width: 520, height: 18 }}
      />
    </UiEntity>

    {/* Player HP + timer strip, centered under the boss bar */}
    <UiEntity
      uiTransform={{ width: 520, height: 40, margin: '8px 0 0 0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.45) }}
    >
      <Label
        value={`HP ${hudState.playerHp}`}
        fontSize={18}
        color={Color4.White()}
        textAlign="middle-left"
        uiTransform={{ width: 90, height: 30, margin: '0 0 0 12px' }}
      />
      <UiEntity uiTransform={{ width: PLAYER_BAR_W, height: 14 }} uiBackground={{ color: Color4.create(0.15, 0.15, 0.15, 0.9) }}>
        <UiEntity
          uiTransform={{ width: Math.max(0, (PLAYER_BAR_W * hudState.playerHp) / hudState.playerMax), height: 14 }}
          uiBackground={{ color: Color4.fromHexString('#22c55e') }}
        />
      </UiEntity>
      <Label
        value={`${formatTime(hudState.timeS)} / 5:00`}
        fontSize={18}
        color={Color4.White()}
        textAlign="middle-right"
        uiTransform={{ width: 130, height: 30, margin: '0 12px 0 0' }}
      />
    </UiEntity>

    {/* Phase banner */}
    {hudState.banner ? (
      <Label
        value={hudState.banner}
        fontSize={26}
        color={Color4.fromHexString('#facc15')}
        textAlign="middle-center"
        uiTransform={{ width: 900, height: 40, margin: '24px 0 0 0' }}
      />
    ) : (
      <UiEntity uiTransform={{ width: 900, height: 40, margin: '24px 0 0 0' }} />
    )}

    {/* Intro panel */}
    {hudState.phase === 'intro' && (
      <UiEntity
        uiTransform={{ width: 560, height: 330, margin: '60px 0 0 0', flexDirection: 'column', alignItems: 'center', padding: 20 }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.75) }}
      >
        <Label value="CRYSTAL GOLEM" fontSize={36} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: 520, height: 48 }} />
        <Label value="Final Boss - GAME OVER 2026" fontSize={18} color={Color4.create(0.7, 0.9, 1, 1)} textAlign="middle-center" uiTransform={{ width: 520, height: 28 }} />
        <Label value="Click the golem to attack." fontSize={18} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: 520, height: 28 }} />
        <Label value="Dodge the red circles and crystal shards." fontSize={18} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: 520, height: 28 }} />
        <Label value="Defeat it in under 5 minutes." fontSize={18} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: 520, height: 28 }} />
        <Button
          uiTransform={{ width: 220, height: 56, margin: '20px 0 0 0' }}
          value="START FIGHT"
          variant="primary"
          fontSize={22}
          onMouseDown={() => startFight()}
        />
      </UiEntity>
    )}

    {/* Victory panel */}
    {hudState.phase === 'victory' && (
      <UiEntity
        uiTransform={{ width: 560, height: 330, margin: '60px 0 0 0', flexDirection: 'column', alignItems: 'center', padding: 20 }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.75) }}
      >
        <Label value="VICTORY!" fontSize={40} color={Color4.fromHexString('#facc15')} textAlign="middle-center" uiTransform={{ width: 520, height: 56 }} />
        <Label value="The Crystal Golem is defeated." fontSize={18} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: 520, height: 28 }} />
        <Label value={`Time: ${formatTime(hudState.timeS)}`} fontSize={20} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: 520, height: 30 }} />
        <Label value={`Score: ${hudState.score}`} fontSize={20} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: 520, height: 30 }} />
        <Label value={`Shards smashed: ${hudState.shardsSmashed}`} fontSize={16} color={Color4.create(0.8, 0.8, 0.8, 1)} textAlign="middle-center" uiTransform={{ width: 520, height: 26 }} />
        <Label value={`Spikes shattered: ${hudState.spikesBroken} / 2`} fontSize={16} color={Color4.create(0.8, 0.8, 0.8, 1)} textAlign="middle-center" uiTransform={{ width: 520, height: 26 }} />
        <Button
          uiTransform={{ width: 220, height: 56, margin: '20px 0 0 0' }}
          value="PLAY AGAIN"
          variant="primary"
          fontSize={22}
          onMouseDown={() => resetFight()}
        />
      </UiEntity>
    )}

    {/* Defeat panel */}
    {hudState.phase === 'defeat' && (
      <UiEntity
        uiTransform={{ width: 560, height: 300, margin: '60px 0 0 0', flexDirection: 'column', alignItems: 'center', padding: 20 }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.75) }}
      >
        <Label value="DEFEAT" fontSize={40} color={Color4.fromHexString('#ef4444')} textAlign="middle-center" uiTransform={{ width: 520, height: 56 }} />
        <Label value="The Golem stands victorious..." fontSize={18} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: 520, height: 28 }} />
        <Label value={`Boss HP left: ${hudState.bossHp} / ${hudState.bossMax}`} fontSize={18} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: 520, height: 28 }} />
        <Label value="Dodge the red circles. Smash the shards to heal." fontSize={16} color={Color4.create(0.8, 0.8, 0.8, 1)} textAlign="middle-center" uiTransform={{ width: 520, height: 26 }} />
        <Button
          uiTransform={{ width: 220, height: 56, margin: '20px 0 0 0' }}
          value="TRY AGAIN"
          variant="primary"
          fontSize={22}
          onMouseDown={() => resetFight()}
        />
      </UiEntity>
    )}
  </UiEntity>
)
