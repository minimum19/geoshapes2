import { useEffect, useState } from 'react'
import { useAccount, useConnect, useReadContract, useWriteContract } from 'wagmi'
import { config } from './wagmi'
import { switchChain } from 'wagmi/actions'
import { parseEther } from 'viem'
import styles from './App.module.css'

// Types
interface GeometryResult {
  shapeType: string
  colors: {
    primary: string
    secondary: string
  }
}

interface AppState {
  isLoading: boolean
  isMinting: boolean
  error: string | null
}

// Constants
const CONTRACT_ADDRESS = '0x606FF3848F9585F601B963De94d9969f32D7a97e'
const SHAPE_TYPES = ["Circle", "Triangle", "Square", "Pentagon", "Hexagon", "Octagon", "Star", "Diamond"]
const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"]
const MAX_SUPPLY = 10000n
const MINT_PRICE = '0.0001'

// ABI definitions
const MINTED_BY_ABI = [
  {
    type: 'function',
    name: 'mintedBy',
    inputs: [{ name: 'minter', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
] as const

const TOTAL_SUPPLY_ABI = [
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
] as const

const MINT_ABI = [
  { 
    type: 'function', 
    name: 'mint', 
    inputs: [], 
    outputs: [], 
    stateMutability: 'payable' 
  }
] as const

const GET_TOKENS_ABI = [
  {
    type: 'function',
    name: 'getTokensOfOwner',
    inputs: [{ name: 'owner', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256[]', internalType: 'uint256[]' }],
    stateMutability: 'view',
  },
] as const

// Utility functions
function getGeometry(tokenId: bigint): GeometryResult {
  const shapeIndex = Number(tokenId) % SHAPE_TYPES.length
  const primaryIndex = Number(tokenId) % COLORS.length
  const secondaryIndex = (Number(tokenId) + 1) % COLORS.length
  
  return {
    shapeType: SHAPE_TYPES[shapeIndex],
    colors: {
      primary: COLORS[primaryIndex],
      secondary: COLORS[secondaryIndex]
    }
  }
}

function getImage(tokenId: bigint, geometry: GeometryResult) {
  const { shapeType, colors } = geometry
  const size = 200 + (Number(tokenId) % 150)
  
  return (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'>
      <defs>
        <radialGradient id="bgGradient" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#2a2a4a" />
          <stop offset="100%" stopColor="#1a1a2e" />
        </radialGradient>
      </defs>
      <rect width='400' height='400' fill='url(#bgGradient)' />
      <g transform='translate(200,200)'>
        {shapeType === 'Circle' && (
          <circle cx='0' cy='0' r={size/2} fill={colors.primary} stroke={colors.secondary} strokeWidth='4' />
        )}
        {shapeType === 'Triangle' && (
          <polygon points={`0,-${size/2} -${size*0.43},${size/4} ${size*0.43},${size/4}`} fill={colors.primary} stroke={colors.secondary} strokeWidth='4' />
        )}
        {shapeType === 'Square' && (
          <rect x={-size/2} y={-size/2} width={size} height={size} fill={colors.primary} stroke={colors.secondary} strokeWidth='4' />
        )}
        {shapeType === 'Pentagon' && (
          <polygon points={`0,-${size/2} -${size*0.48},-${size*0.15} -${size*0.29},${size*0.41} ${size*0.29},${size*0.41} ${size*0.48},-${size*0.15}`} fill={colors.primary} stroke={colors.secondary} strokeWidth='4' />
        )}
        {shapeType === 'Hexagon' && (
          <polygon points={`0,-${size/2} -${size*0.43},-${size/4} -${size*0.43},${size/4} 0,${size/2} ${size*0.43},${size/4} ${size*0.43},-${size/4}`} fill={colors.primary} stroke={colors.secondary} strokeWidth='4' />
        )}
        {shapeType === 'Star' && (
          <polygon points={`0,-${size/2} -${size*0.11},-${size*0.15} -${size*0.48},-${size*0.15} -${size*0.18},${size*0.06} -${size*0.29},${size*0.41} 0,${size*0.2} ${size*0.29},${size*0.41} ${size*0.18},${size*0.06} ${size*0.48},-${size*0.15} ${size*0.11},-${size*0.15}`} fill={colors.primary} stroke={colors.secondary} strokeWidth='4' />
        )}
        {shapeType === 'Diamond' && (
          <polygon points={`0,-${size/2} -${size*0.35},0 0,${size/2} ${size*0.35},0`} fill={colors.primary} stroke={colors.secondary} strokeWidth='4' />
        )}
        {shapeType === 'Octagon' && (
          <polygon points={`0,-${size/2} -${size*0.35},-${size*0.35} -${size/2},0 -${size*0.35},${size*0.35} 0,${size/2} ${size*0.35},${size*0.35} ${size/2},0 ${size*0.35},-${size*0.35}`} fill={colors.primary} stroke={colors.secondary} strokeWidth='4' />
        )}
      </g>
    </svg>
  )
}

function App() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { writeContract, data: txId, isPending: isMintPending } = useWriteContract()

  // State
  const [selectedTokenId, setSelectedTokenId] = useState<bigint>()
  const [shapeType, setShapeType] = useState<string>()
  const [colors, setColors] = useState<{ primary: string; secondary: string }>()
  const [image, setImage] = useState<React.ReactNode>()
  const [appState, setAppState] = useState<AppState>({
    isLoading: false,
    isMinting: false,
    error: null
  })

  // Contract reads
  const {
    data: ownedTokens,
    isError: isTokenError,
    isLoading: isTokenLoading,
    refetch: refetchTokens,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: GET_TOKENS_ABI,
    functionName: 'getTokensOfOwner',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 10000, // Refetch every 10 seconds
    },
  })

  const { 
    data: totalSupply, 
    isLoading: isTotalSupplyLoading,
    refetch: refetchTotalSupply 
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: TOTAL_SUPPLY_ABI,
    functionName: 'totalSupply',
    args: [],
    query: {
      refetchInterval: 15000, // Refetch every 15 seconds
    },
  })

  // Effects
  useEffect(() => {
    if (isConnected) {
      switchChain(config, { chainId: config.chains[0].id }).catch(console.error)
    } else if (connectors.length > 0) {
      connect({ connector: connectors[0] })
    }
  }, [isConnected, connect, connectors])

  useEffect(() => {
    if (isTokenError) {
      setAppState(prev => ({ ...prev, error: 'Error loading token data' }))
    }
  }, [isTokenError])

  useEffect(() => {
    if (!txId) return

    setAppState(prev => ({ ...prev, isMinting: true }))
    
    // Refetch data after transaction
    const timeouts = [1000, 2000, 3000, 5000, 10000].map(delay =>
      setTimeout(() => {
        refetchTokens()
        refetchTotalSupply()
      }, delay)
    )

    const finalTimeout = setTimeout(() => {
      setAppState(prev => ({ ...prev, isMinting: false }))
    }, 10000)

    return () => {
      timeouts.forEach(clearTimeout)
      clearTimeout(finalTimeout)
    }
  }, [txId, refetchTokens, refetchTotalSupply])

  useEffect(() => {
    if (!selectedTokenId) {
      if (ownedTokens && ownedTokens.length > 0) {
        setSelectedTokenId(ownedTokens[0])
      }
      return
    }
    
    const geometry = getGeometry(selectedTokenId)
    setShapeType(geometry.shapeType)
    setColors(geometry.colors)
    setImage(getImage(selectedTokenId, geometry))
  }, [selectedTokenId, ownedTokens])

  // Auto-connect for iframe (Frame app)
  useEffect(() => {
    let intervalId: number

    if (!isConnected && window.self !== window.top) {
      intervalId = setInterval(() => {
        if (connectors.length > 0) {
          connect({ connector: connectors[0] })
        }
      }, 2000)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [isConnected, connect, connectors])

  // Handlers
  const handleMint = async () => {
    if (!isConnected) return

    try {
      setAppState(prev => ({ ...prev, error: null }))
      await switchChain(config, { chainId: config.chains[0].id })
      
      writeContract({
        abi: MINT_ABI,
        address: CONTRACT_ADDRESS,
        functionName: 'mint',
        args: [],
        value: parseEther(MINT_PRICE),
      })
    } catch (error) {
      setAppState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Failed to mint' 
      }))
    }
  }

  // Render helpers
  const renderTokenDisplay = () => {
    if (isTokenLoading) {
      return (
        <div className={styles.loading}>
          <div className={styles.loadingIcon}>⟳</div>
          <p>Loading...</p>
        </div>
      )
    }

    if (ownedTokens && ownedTokens.length > 0) {
      return (
        <div className={styles.tokenDisplay}>
          <div className={styles.tokenSelector}>
            {ownedTokens.map((tokenId) => (
              <button
                key={tokenId.toString()}
                onClick={() => setSelectedTokenId(tokenId)}
                className={`${styles.tokenButton} ${selectedTokenId === tokenId ? styles.selected : ''}`}
              >
                #{tokenId.toString()}
              </button>
            ))}
          </div>
          <div className={styles.tokenCard}>
            <div>
              {image}
            </div>
            <div className={styles.tokenInfo}>
              <h2 className={styles.tokenId}>
                GeoShape #{selectedTokenId?.toString()}
              </h2>
              <h3 className={styles.shapeType}>
                Shape: {shapeType}
              </h3>
              <div className={styles.colorDisplay}>
                {colors && (
                  <>
                    <div className={styles.colorSwatch} style={{ backgroundColor: colors.primary }} />
                    <div className={styles.colorSwatch} style={{ backgroundColor: colors.secondary }} />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className={styles.tokenDisplay}>
        <p className={styles.loadingIcon}>?</p>
        <p>No tokens minted yet</p>
      </div>
    )
  }

  const renderMintButton = () => {
    if (!isConnected) {
      return (
        <a href='https://warpcast.com/~/mini-apps/launch?domain=geoshapes.pages.dev' className={styles.warpcastLink}>
          Open in Warpcast
        </a>
      )
    }

    const isDisabled = totalSupply === MAX_SUPPLY || isMintPending || appState.isMinting
    const isLoading = isMintPending || appState.isMinting

    let buttonText = 'Mint for 0.0001 MON'
    if (totalSupply === MAX_SUPPLY) buttonText = 'All Minted'
    else if (isLoading) buttonText = 'Minting...'

    return (
      <button
        className={styles.mintButton}
        disabled={isDisabled}
        onClick={handleMint}
      >
        {isLoading && <span className={styles.spinner}>⟳</span>}
        {buttonText}
      </button>
    )
  }

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            GeoShapes
          </h1>
          <p className={styles.subtitle}>
            unique geometric NFTs!
          </p>
          
          <h3 className={styles.supply}>
            {isTotalSupplyLoading ? (
              <span>Loading...</span>
            ) : (
              <span>{totalSupply?.toString() || '?'} / {MAX_SUPPLY.toString()}</span>
            )}
          </h3>
        </div>

        {appState.error && (
          <div className={styles.error}>
            {appState.error}
          </div>
        )}

        <div>
          {renderTokenDisplay()}
          {!selectedTokenId && (
            <div className={styles.previewGrid}>
              <div>
                {getImage(2n, getGeometry(2n))}
              </div>
              <div>
                {getImage(3n, getGeometry(3n))}
              </div>
              <div>
                {getImage(4n, getGeometry(4n))}
              </div>
              <div>
                {getImage(5n, getGeometry(5n))}
              </div>
            </div>
          )}
        </div>

        <div>
          {renderMintButton()}
        </div>
      </main>
    </div>
  )
}

export default App
