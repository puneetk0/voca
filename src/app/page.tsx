import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center sm:p-24">
      <div className="max-w-xl space-y-8">
        <h1 className="font-serif text-4xl font-medium leading-tight sm:text-6xl">
          It's not a form. It's actually you talking to another person.
        </h1>
        <p className="text-opacity-80 text-lg sm:text-xl font-light">
          Structured data collection disguised as a real human conversation, with voice as the primary input.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
          <Link href="/login" className="rounded-full bg-foreground text-background px-8 py-3 font-medium transition-transform hover:scale-105">
            Create a Form
          </Link>
          <a href="https://github.com/puneetk0/voca" target="_blank" className="rounded-full border border-foreground/20 px-8 py-3 font-medium transition-colors hover:bg-foreground/5">
            View Source
          </a>
        </div>
      </div>
    </main>
  );
}
