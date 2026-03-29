import React, { Suspense, useState, useRef, useMemo } from 'react';
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, TransformControls, DragControls, Center, Environment, Html, useProgress } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';

// --- CATALOG DATA ---
const PLATE_LIBRARY = [
  { id: 'p1', name: 'Plate 1', url: '/models/plates/plate1.stl' },
  { id: 'p2', name: 'Plate 2', url: '/models/plates/plate2.stl' },
];

const BONE_LIBRARY = [
  { id: 'femur_demo', name: 'Femur Demo', url: '/models/10_FEMUR_BONE_MESH/Segmentation_Bone_2.stl', available: true },
  { id: 'coming_soon', name: 'Coming Soon', url: '', available: false },
];

// --- LOADER COMPONENT ---
function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '100vw', height: '100vh', backgroundColor: '#121212',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        color: '#00BCD4', fontFamily: 'sans-serif', zIndex: 9999
      }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>Loading Workspace...</div>
        <div style={{ fontSize: '18px', color: '#888' }}>{progress.toFixed(0)}%</div>
      </div>
    </Html>
  );
}

// --- BONE FRAGMENT COMPONENT ---
const BoneFragment = ({ url, color, activeMesh, setActiveMesh, appMode, setIsDraggingBone }) => {
  const geometry = useLoader(STLLoader, url);
  const groupRef = useRef();

  const center = useMemo(() => {
    geometry.computeBoundingBox();
    geometry.computeVertexNormals(); 
    const vec = new THREE.Vector3();
    geometry.boundingBox.getCenter(vec);
    return vec;
  }, [geometry]);

  return (
    <DragControls 
      disabled={appMode !== 'translate'}
      onDragStart={() => setIsDraggingBone(true)}
      onDragEnd={() => setIsDraggingBone(false)}
    >
      <group 
        ref={groupRef} position={[center.x, center.y, center.z]}
        onPointerDown={(e) => { if (appMode !== 'translate') e.stopPropagation(); }}
        onClick={(e) => {
          e.stopPropagation(); 
          if (appMode === 'rotate') setActiveMesh(groupRef.current);
        }}
        onPointerOver={() => { 
          if (appMode === 'translate') document.body.style.cursor = 'grab';
          else if (appMode === 'rotate') document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <mesh name="bone" geometry={geometry} position={[-center.x, -center.y, -center.z]}>
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} emissive={color} emissiveIntensity={0.03} />
        </mesh>
      </group>
    </DragControls>
  );
};

// --- PLATE FRAGMENT COMPONENT (MAGNETIC SNAP) ---
const PlateFragment = ({ url, activeMesh, setActiveMesh, appMode, setIsDraggingBone }) => {
  const geometry = useLoader(STLLoader, url);
  const groupRef = useRef();
  
  const { camera, raycaster, pointer, scene } = useThree(); 
  
  const [isDragging, setIsDragging] = useState(false);
  const dragPlane = useMemo(() => new THREE.Plane(), []);
  const dragTarget = useMemo(() => new THREE.Vector3(), []);
  const lastPointer = useRef(new THREE.Vector2());

  const spawnPosition = useMemo(() => {
    geometry.computeVertexNormals(); 
    geometry.center(); 
    const directionToCamera = camera.position.clone().normalize();
    const spawnPos = directionToCamera.multiplyScalar(250);
    const scatterX = (Math.random() - 0.5) * 40;
    const scatterY = (Math.random() - 0.5) * 40;
    return [spawnPos.x + scatterX, spawnPos.y + scatterY, spawnPos.z];
  }, [geometry, camera]);

  useFrame(() => {
    if (isDragging && appMode === 'translate') {
      if (lastPointer.current.x === pointer.x && lastPointer.current.y === pointer.y) return;
      lastPointer.current.copy(pointer);

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      const boneHit = intersects.find(hit => hit.object.name === 'bone');

      if (boneHit) {
        const worldNormal = boneHit.face.normal.clone().transformDirection(boneHit.object.matrixWorld);
        const surfaceOffset = worldNormal.multiplyScalar(2); 
        groupRef.current.position.copy(boneHit.point).add(surfaceOffset);
      } else {
        raycaster.ray.intersectPlane(dragPlane, dragTarget);
        if (dragTarget) {
          groupRef.current.position.copy(dragTarget);
        }
      }
    }
  });

  return (
    <group 
      ref={groupRef} 
      position={spawnPosition} 
      onPointerDown={(e) => { 
        if (appMode === 'translate') { 
          e.stopPropagation(); 
          setIsDragging(true);
          setIsDraggingBone(true); 
          const cameraDir = camera.getWorldDirection(new THREE.Vector3());
          dragPlane.setFromNormalAndCoplanarPoint(cameraDir.negate(), e.point);
          e.target.setPointerCapture(e.pointerId);
        } 
      }}
      onPointerUp={(e) => {
        if (appMode === 'translate') {
          setIsDragging(false);
          setIsDraggingBone(false); 
          e.target.releasePointerCapture(e.pointerId);
        }
      }}
      onClick={(e) => {
        e.stopPropagation(); 
        if (appMode === 'rotate') setActiveMesh(groupRef.current);
      }}
      onPointerOver={() => { 
        if (appMode === 'translate') document.body.style.cursor = 'grab';
        else if (appMode === 'rotate') document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => { document.body.style.cursor = 'default'; }}
    >
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#a0a4a8" roughness={0.2} metalness={0.8} clearcoat={0.5} />
      </mesh>
    </group>
  );
};

// --- THE 3D VIEWER WORKSPACE ---
function Viewer({ boneUrl, onBack }) {
  const [activeMesh, setActiveMesh] = useState(null);
  const [appMode, setAppMode] = useState('orbit'); 
  const [isDraggingWidget, setIsDraggingWidget] = useState(false);
  const [isDraggingBone, setIsDraggingBone] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [coordSpace, setCoordSpace] = useState('local'); 
  const [importedPlates, setImportedPlates] = useState([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const handleAddPlate = (plateData) => {
    setImportedPlates((prev) => [...prev, { instanceId: Date.now(), url: plateData.url, name: plateData.name }]);
    setIsLibraryOpen(false); 
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      
      {/* Top Left: Back Button */}
      <button 
        onClick={onBack}
        style={{
          position: 'absolute', top: 20, left: 20, zIndex: 10, padding: '10px 15px',
          backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444',
          borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
        }}
      >
        Return Home
      </button>

      {/* Plate Library Modal */}
      {isLibraryOpen && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', 
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', 
          justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            width: '600px', backgroundColor: '#1e1e1e', borderRadius: '12px', 
            padding: '20px', border: '1px solid #444', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
              <h2 style={{ color: 'white', margin: 0, fontSize: '20px' }}>Hardware Library</h2>
              <button onClick={() => setIsLibraryOpen(false)} style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', maxHeight: '400px', overflowY: 'auto' }}>
              {PLATE_LIBRARY.map((plate) => (
                <button 
                  key={plate.id} onClick={() => handleAddPlate(plate)}
                  style={{ backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', padding: '15px', color: 'white', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
                >
                  <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{plate.name}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>Click to insert</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main UI Controls */}
      <div style={{
        position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, display: 'flex', flexDirection: 'column', gap: '10px',
        backgroundColor: 'rgba(20, 20, 20, 0.85)', padding: '15px', borderRadius: '12px',
        border: '1px solid #444', alignItems: 'center', backdropFilter: 'blur(5px)',
        minWidth: 'max-content'
      }}>
        
        {/* NEW: Camera and Object Controls in a single row */}
        <div style={{ display: 'flex', gap: '15px', width: '100%' }}>
          
          {/* Camera Controls Group */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }}>
            <span style={{ color: '#aaa', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Camera</span>
            <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'center' }}>
              <button style={{...btnStyle(appMode === 'orbit', '#FF9800'), flex: 1}} onClick={() => { setAppMode('orbit'); setActiveMesh(null); }}>Orbit</button>
              <button style={{...btnStyle(appMode === 'pan', '#9C27B0'), flex: 1}} onClick={() => { setAppMode('pan'); setActiveMesh(null); }}>Pan</button>
            </div>
          </div>

          {/* Object Controls Group */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }}>
            <span style={{ color: '#aaa', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Object</span>
            <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'center' }}>
              <button style={{...btnStyle(appMode === 'translate', '#4CAF50'), flex: 1}} onClick={() => { setAppMode('translate'); setActiveMesh(null); }}>Move</button>
              <button style={{...btnStyle(appMode === 'rotate', '#2196F3'), flex: 1}} onClick={() => setAppMode('rotate')}>Rotate</button>
            </div>
          </div>

        </div>

        {/* Rotate Context Options */}
        {appMode === 'rotate' && (
          <div style={{ display: 'flex', gap: '10px', paddingTop: '5px', borderTop: '1px solid #555', width: '100%', justifyContent: 'center' }}>
            <button style={helperBtnStyle(snapEnabled)} onClick={() => setSnapEnabled(!snapEnabled)}>Snap (5°) {snapEnabled ? 'ON' : 'OFF'}</button>
            <button style={helperBtnStyle(coordSpace === 'local')} onClick={() => setCoordSpace(coordSpace === 'local' ? 'world' : 'local')}>Space: {coordSpace.toUpperCase()}</button>
          </div>
        )}

        <button style={{...btnStyle(false, '#333'), backgroundColor: '#00BCD4', width: '100%', marginTop: '5px'}} onClick={() => setIsLibraryOpen(true)}>
          ➕ Open Plate Library
        </button>
      </div>

      <Canvas shadows camera={{ position: [0, 0, 500], fov: 45, near: 0.1, far: 5000 }} onPointerMissed={() => setActiveMesh(null)}>
        <ambientLight intensity={0.4} /> 
        <directionalLight position={[500, 500, 500]} intensity={1.2} castShadow />
        <pointLight position={[-500, 200, -500]} intensity={0.8} color="#ffffff" />
        <Environment preset="city" />

        {activeMesh && appMode === 'rotate' && (
          <TransformControls 
            object={activeMesh} mode="rotate" size={0.7} space={coordSpace}
            rotationSnap={snapEnabled ? Math.PI / 36 : null} 
            onDraggingChanged={(e) => setIsDraggingWidget(e.value)}
          />
        )}

        <Suspense fallback={<Loader />}>
          <Center>
            <BoneFragment url="/models/10_FEMUR_BONE_MESH/Segmentation_Bone_2.stl" color="#fdfaf0" activeMesh={activeMesh} setActiveMesh={setActiveMesh} appMode={appMode} setIsDraggingBone={setIsDraggingBone} />
            <BoneFragment url="/models/10_FEMUR_BONE_MESH/Segmentation_Bone_3.stl" color="#fdfaf0" activeMesh={activeMesh} setActiveMesh={setActiveMesh} appMode={appMode} setIsDraggingBone={setIsDraggingBone} />
            <BoneFragment url="/models/10_FEMUR_BONE_MESH/Segmentation_Bone_4.stl" color="#fdfaf0" activeMesh={activeMesh} setActiveMesh={setActiveMesh} appMode={appMode} setIsDraggingBone={setIsDraggingBone} />
            <BoneFragment url="/models/10_FEMUR_BONE_MESH/Segmentation_Bone.stl" color="#fdfaf0" activeMesh={activeMesh} setActiveMesh={setActiveMesh} appMode={appMode} setIsDraggingBone={setIsDraggingBone} />
          </Center>
          {importedPlates.map((plate) => (
            <PlateFragment key={plate.instanceId} url={plate.url} activeMesh={activeMesh} setActiveMesh={setActiveMesh} appMode={appMode} setIsDraggingBone={setIsDraggingBone} />
          ))}
        </Suspense>

        <OrbitControls makeDefault enabled={appMode === 'orbit' || appMode === 'pan' || (appMode === 'translate' && !isDraggingBone) || (appMode === 'rotate' && !isDraggingWidget)} mouseButtons={{ LEFT: appMode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: appMode === 'pan' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN }} />
      </Canvas>
    </div>
  );
}

// --- MAIN APP ENTRY POINT (Routing Logic) ---
export default function App() {
  const [currentScreen, setCurrentScreen] = useState('home'); 
  const [selectedBoneUrl, setSelectedBoneUrl] = useState(null);

  if (currentScreen === 'home') {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundColor: '#121212', color: 'white', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '100px' }}>
        <h1 style={{ fontSize: '36px', marginBottom: '10px', color: '#00BCD4' }}>Surgical Pre-Op Planner</h1>
        <p style={{ color: '#888', marginBottom: '50px' }}>Select an anatomical region to begin workspace configuration.</p>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', maxWidth: '600px', width: '100%', padding: '0 20px' }}>
          {BONE_LIBRARY.map((bone) => (
            <div 
              key={bone.id}
              onClick={() => {
                if (bone.available) {
                  setSelectedBoneUrl(bone.url);
                  setCurrentScreen('viewer');
                }
              }}
              style={{
                backgroundColor: bone.available ? '#1e1e1e' : '#151515',
                border: bone.available ? '1px solid #00BCD4' : '1px solid #333',
                borderRadius: '12px', padding: '30px 20px', textAlign: 'center',
                cursor: bone.available ? 'pointer' : 'not-allowed',
                opacity: bone.available ? 1 : 0.5,
                transition: 'all 0.2s ease',
                boxShadow: bone.available ? '0 4px 15px rgba(0, 188, 212, 0.1)' : 'none'
              }}
              onMouseOver={(e) => { if(bone.available) e.currentTarget.style.transform = 'translateY(-5px)' }}
              onMouseOut={(e) => { if(bone.available) e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <h3 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>{bone.name}</h3>
              <span style={{ 
                fontSize: '12px', 
                color: bone.available ? '#4CAF50' : '#888', 
                backgroundColor: bone.available ? 'rgba(76, 175, 80, 0.1)' : '#222', 
                padding: '4px 8px', borderRadius: '4px' 
              }}>
                {bone.available ? 'Model Ready' : 'In Development'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <Viewer boneUrl={selectedBoneUrl} onBack={() => setCurrentScreen('home')} />;
}

// --- STYLING HELPERS ---
const btnStyle = (isActive, activeColor) => ({
  padding: '10px 15px', cursor: 'pointer', border: 'none', borderRadius: '6px',
  backgroundColor: isActive ? activeColor : '#333', color: 'white', fontWeight: 'bold',
  fontSize: '13px', transition: 'all 0.2s ease'
});

const helperBtnStyle = (isActive) => ({
  fontSize: '11px', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer',
  border: '1px solid #555', backgroundColor: isActive ? '#eee' : '#222',
  color: isActive ? '#000' : '#ccc', fontWeight: 'bold'
});