'use client'

import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'

export interface TypewriterHandle {
  finish: () => void
}

interface TypewriterProps {
  text: string
  speed?: number
  onComplete?: () => void
  className?: string
}

const Typewriter = forwardRef<TypewriterHandle, TypewriterProps>(
  ({ text, speed = 40, onComplete, className }, ref) => {
    const [display, setDisplay] = useState('')
    const [done, setDone] = useState(false)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const indexRef = useRef(0)
    const wordsRef = useRef<string[]>([])

    const clearAnim = () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }

    const finish = () => {
      clearAnim()
      setDisplay(text)
      setDone(true)
      onComplete?.()
    }

    useImperativeHandle(ref, () => ({ finish }))

    useEffect(() => {
      setDisplay('')
      setDone(false)
      indexRef.current = 0
      wordsRef.current = text.split(' ')
      clearAnim()

      intervalRef.current = setInterval(() => {
        if (indexRef.current >= wordsRef.current.length) {
          clearAnim()
          setDone(true)
          onComplete?.()
          return
        }
        const nextWord = wordsRef.current[indexRef.current]
        setDisplay(prev => (prev ? prev + ' ' + nextWord : nextWord))
        indexRef.current++
      }, speed)

      return clearAnim
    }, [text])

    return <span className={className}>{display}</span>
  }
)

Typewriter.displayName = 'Typewriter'
export default Typewriter
