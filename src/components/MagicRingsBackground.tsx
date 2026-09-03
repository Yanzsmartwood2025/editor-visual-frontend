'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

type MagicRingsBackgroundProps = {
  className?: string
  enabled?: boolean
}

export function MagicRingsBackground({ className = '', enabled = true }: MagicRingsBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!enabled || !canvasRef.current) return

    const canvas = canvasRef.current
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(0, 0, 9)

    const group = new THREE.Group()
    scene.add(group)

    const ringGeometry = new THREE.TorusGeometry(2.15, 0.018, 6, 96)
    const materials = [
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.24 }),
      new THREE.MeshBasicMaterial({ color: 0x8b8b8b, transparent: true, opacity: 0.17 }),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }),
    ]
    materials.forEach((material, index) => {
      const ring = new THREE.Mesh(ringGeometry, material)
      ring.rotation.x = Math.PI / 2 + index * 0.25
      ring.rotation.y = index * 0.42
      ring.scale.setScalar(1 + index * 0.13)
      group.add(ring)
    })

    const pointer = { x: 0, y: 0 }
    const orientation = { x: 0, y: 0 }
    let frame = 0
    let lastTime = 0
    let disposed = false

    const resize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      group.scale.setScalar(Math.max(0.82, Math.min(1.3, width / 900)))
    }
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2
    }
    const onOrientation = (event: DeviceOrientationEvent) => {
      orientation.x = Math.max(-1, Math.min(1, (event.gamma ?? 0) / 35))
      orientation.y = Math.max(-1, Math.min(1, (event.beta ?? 0) / 45))
    }
    const animate = (time: number) => {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      if (time - lastTime < 42) return
      lastTime = time
      const targetX = pointer.x * 0.18 + orientation.x * 0.22
      const targetY = pointer.y * 0.12 + orientation.y * 0.16
      group.rotation.x += (targetY - group.rotation.x) * 0.045
      group.rotation.y += (targetX - group.rotation.y) * 0.045
      group.rotation.z += 0.0007
      renderer.render(scene, camera)
    }

    resize()
    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('deviceorientation', onOrientation, { passive: true })
    frame = requestAnimationFrame(animate)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('deviceorientation', onOrientation)
      ringGeometry.dispose()
      materials.forEach((material) => material.dispose())
      renderer.dispose()
    }
  }, [enabled])

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none fixed inset-0 z-0 h-full w-full opacity-70 ${className}`} />
}

export default MagicRingsBackground
