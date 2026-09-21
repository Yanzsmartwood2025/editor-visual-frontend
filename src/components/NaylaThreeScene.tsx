import React, { useEffect, useMemo, useRef } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useFrame, useLoader } from '@react-three/fiber';
import {
  AnimationMixer,
  Group,
  LoopRepeat,
  MathUtils,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type NaylaThreeScene = {
  id: string;
  mediaId: string;
  label?: string;
  url: string;
  start: number;
  end: number;
  modelScale?: number;
  position?: { x?: number; y?: number; z?: number };
  rotation?: { x?: number; y?: number; z?: number };
  autoRotate?: boolean;
  rotationSpeed?: number;
  cameraDistance?: number;
  cameraFov?: number;
  lighting?: 'studio' | 'soft' | 'dramatic';
  backgroundColor?: string;
  animationName?: string;
};

const SceneModel: React.FC<{ scene: NaylaThreeScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const groupRef = useRef<Group>(null);
  const gltf = useLoader(GLTFLoader, scene.url);

  const clonedScene = useMemo(
    () => cloneSkeleton(gltf.scene) as Object3D,
    [gltf.scene]
  );

  const mixer = useMemo(
    () => new AnimationMixer(clonedScene),
    [clonedScene]
  );

  const selectedAnimation = useMemo(() => {
    const animations = Array.isArray(gltf.animations) ? gltf.animations : [];
    if (!animations.length) return null;

    if (scene.animationName) {
      const requested = animations.find(
        (clip) => clip.name.toLowerCase() === scene.animationName!.toLowerCase()
      );
      if (requested) return requested;
    }

    return animations[0] || null;
  }, [gltf.animations, scene.animationName]);

  useEffect(() => {
    if (!selectedAnimation) return;
    const action = mixer.clipAction(selectedAnimation);
    action.setLoop(LoopRepeat, Infinity);
    action.play();

    return () => {
      action.stop();
      mixer.stopAllAction();
    };
  }, [mixer, selectedAnimation]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const baseRotation = scene.rotation || {};
    const seconds = frame / fps;
    const rotationSpeed = Number.isFinite(Number(scene.rotationSpeed))
      ? Number(scene.rotationSpeed)
      : 24;

    group.rotation.set(
      MathUtils.degToRad(Number(baseRotation.x) || 0),
      MathUtils.degToRad(Number(baseRotation.y) || 0) +
        (scene.autoRotate === false ? 0 : MathUtils.degToRad(rotationSpeed * seconds)),
      MathUtils.degToRad(Number(baseRotation.z) || 0)
    );

    if (selectedAnimation) {
      const clipDuration = Math.max(0.001, selectedAnimation.duration || 0.001);
      mixer.setTime(seconds % clipDuration);
    }

    clonedScene.updateMatrixWorld(true);
  });

  const scale = Math.max(0.02, Math.min(30, Number(scene.modelScale) || 1));
  const position = scene.position || {};

  return (
    <group
      ref={groupRef}
      scale={[scale, scale, scale]}
      position={[
        Number(position.x) || 0,
        Number(position.y) || 0,
        Number(position.z) || 0,
      ]}
    >
      <primitive object={clonedScene} />
    </group>
  );
};

const Lights: React.FC<{ preset: NaylaThreeScene['lighting'] }> = ({ preset = 'studio' }) => {
  if (preset === 'dramatic') {
    return (
      <>
        <ambientLight intensity={0.28} />
        <directionalLight position={[4, 5, 5]} intensity={2.1} color="#ffffff" />
        <pointLight position={[-4, 1, 2]} intensity={1.35} color="#7aa8ff" />
        <pointLight position={[3, -2, 1]} intensity={0.8} color="#ff8a72" />
      </>
    );
  }

  if (preset === 'soft') {
    return (
      <>
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 6]} intensity={1.15} color="#ffffff" />
        <directionalLight position={[-3, 1, 4]} intensity={0.55} color="#dbe8ff" />
      </>
    );
  }

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 5]} intensity={1.7} color="#ffffff" />
      <directionalLight position={[-4, 2, 3]} intensity={0.9} color="#b8d4ff" />
      <pointLight position={[0, -2, 4]} intensity={0.55} color="#ffffff" />
    </>
  );
};

export const NaylaThreeSceneRenderer: React.FC<{
  scene: NaylaThreeScene;
}> = ({ scene }) => {
  const { width, height } = useVideoConfig();
  const cameraDistance = Math.max(0.8, Math.min(40, Number(scene.cameraDistance) || 5));
  const cameraFov = Math.max(15, Math.min(100, Number(scene.cameraFov) || 42));
  const background = scene.backgroundColor || 'transparent';

  return (
    <AbsoluteFill
      style={{
        background: background === 'transparent' ? 'transparent' : background,
      }}
    >
      <ThreeCanvas
        width={width}
        height={height}
        shadows
        camera={{
          position: [0, 0, cameraDistance],
          fov: cameraFov,
          near: 0.01,
          far: 1000,
        }}
        gl={{ alpha: true, antialias: true }}
        style={{ width, height, background: 'transparent' }}
      >
        <Lights preset={scene.lighting} />
        <SceneModel scene={scene} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
