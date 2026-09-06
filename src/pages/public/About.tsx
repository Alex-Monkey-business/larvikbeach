import { Link } from 'react-router'

export function About() {
  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 720 }}>
      <h1 className="h1">Om oss</h1>
      <div className="stack lede">
        <p>Vi er en gjeng i Larvik som har spilt beachvolley sammen i noen år. Sommeren tar vi på stranda, vinteren i leid hall.</p>
        <p>Det er ikke en klubb med styre og kontingent. Hallen spleiser vi på, de som spiller betaler, ingen andre.</p>
        <p>Nye spillere er velkomne. Du trenger ikke være god, men du bør ville bli bedre.</p>
      </div>
      <Link to="/bli-med" className="btn btn-primary">Bli med</Link>
    </div>
  )
}
