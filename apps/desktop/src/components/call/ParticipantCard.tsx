import { MicOff } from 'lucide-react'
import { Avatar } from '../ui'
import { cx } from '../../lib/utils'
import type { VoiceParticipant } from '../../media/voiceCall'
import styles from './call.module.css'

/**
 * Card de participante: avatar grande, nome, anel verde animado quando fala,
 * badges de mudo e ensurdecido.
 */
export function ParticipantCard({
  participant,
  speaking,
  variant = 'grid'
}: {
  participant: VoiceParticipant
  speaking: boolean
  variant?: 'grid' | 'strip'
}) {
  const isSpeaking = speaking || participant.isSpeaking
  const displayName = participant.isLocal ? `${participant.name} (você)` : participant.name

  return (
    <div
      className={cx(styles.card, isSpeaking && styles.cardSpeaking, variant === 'strip' && styles.cardStrip)}
      aria-label={displayName}
    >
      <div className={styles.bigAvatar}>
        <Avatar name={participant.name} size={variant === 'strip' ? 44 : 72} speaking={isSpeaking} />
      </div>

      <span className={styles.cardName}>
        {displayName}
        {isSpeaking && <span style={{ color: 'var(--speaking-ring)' }}>●</span>}
      </span>

      {participant.muted && (
        <div className={styles.cardBadges}>
          <span className={cx(styles.cardBadge, styles.cardBadgeMuted)} title="Mudo">
            <MicOff size={13} />
          </span>
        </div>
      )}
    </div>
  )
}
