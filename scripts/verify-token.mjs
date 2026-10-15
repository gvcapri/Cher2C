// Valida que o token SFU emitido pelo backend é assinado com o secret do livekit.yaml
import jwt from 'jsonwebtoken'

const secret = process.env.LIVEKIT_API_SECRET ?? 'secret_dev_cher2c_secret_key_123456'
const token = process.argv[2]
if (!token) {
  console.error('Uso: node scripts/verify-token.mjs <token>')
  process.exit(1)
}
const d = jwt.verify(token, secret)
console.log(
  'TOKEN OK -> room:',
  d.video?.room,
  '| canPub:',
  d.video?.canPublish,
  '| canSub:',
  d.video?.canSubscribe,
  '| iss:',
  d.iss
)
