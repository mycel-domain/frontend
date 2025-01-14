import { useCallback, useEffect, useState, useMemo } from 'react'
import { useStore } from '../store/index'
import {
  useBalance,
  useBalance as useBalanceWagmi,
  useConnect as useConnectWagmi,
  useDisconnect as useDisconnectWagmi,
  useWalletClient as useWalletClientWagmi,
  useSignTypedData,
  useAccount as useAccountWagmi,
  useSwitchChain as useSwitchChainWagmi,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi'
import { LocalWallet, onboarding } from '@dydxprotocol/v4-client-js'
import { DirectSecp256k1HdWallet, OfflineSigner } from '@cosmjs/proto-signing'
import { Secp256k1HdWallet, OfflineAminoSigner } from '@cosmjs/amino'
import {
  WALLET_CONFIG,
  MYCEL_CHAIN_INFO,
  getTypedData,
  BECH32_PREFIX,
  EVM_CHAINID,
  getSignDomainData,
  type EvmAddress,
  type MycelAddress,
  type PrivateInformation,
  type WalletType,
} from '../lib/wallets'
import { AES, enc } from 'crypto-js'

export const useWallet = () => {
  // EVM
  const evmAddress = useStore((state) => state.evmAddress)
  const updateEvmAddress = useStore((state) => state.updateEvmAddress)
  const {
    address: evmAddressWagmi,
    isConnected: isConnectedWagmi,
    status: statusWagmi,
    isConnecting: isConnectingWagmi,
    isReconnecting: isReconnectingWagmi,
  } = useAccountWagmi()
  // const publicClientWagmi = usePublicClientWagmi();
  const { data: signerWagmi } = useWalletClientWagmi()
  const { disconnectAsync: disconnectWagmi } = useDisconnectWagmi()
  const { data: hash, sendTransaction } = useSendTransaction()
  const {
    data: receipt,
    isError: receiptError,
    isLoading: receiptLoading,
    isSuccess: receiptSuccess,
  } = useWaitForTransactionReceipt({
    hash,
  })
  const balance = useBalanceWagmi({
    address: evmAddressWagmi,
  })

  // Cosmos
  const mycelAddress = useStore((state) => state.mycelAddress)
  const updateMycelAddress = useStore((state) => state.updateMycelAddress)

  // current wallet
  const currentWalletType = useStore((state) => state.currentWalletType)
  const updateCurrentWalletType = useStore(
    (state) => state.updateCurrentWalletType
  )

  const { connectAsync: connectWagmi, connectors: connectorsWagmi } =
    useConnectWagmi()

  // EVM → mycel account derivation
  const evmDerivedAddresses = useStore((state) => state.evmDerivedAddresses)
  const updateEvmDerivedAddress = useStore(
    (state) => state.updateEvmDerivedAddress
  )
  const staticEncryptionKey = import.meta.env.VITE_PK_ENCRYPTION_KEY

  const connectWallet = useCallback(
    async ({ walletType }: { walletType: WalletType }) => {
      try {
        if (WALLET_CONFIG[walletType].chainType === 'evm') {
          if (!isConnectedWagmi) {
            await connectWagmi({
              connector: connectorsWagmi.find(
                (cn: any) => cn.id === WALLET_CONFIG[walletType].id
              ),
            })
          }
        }
        updateCurrentWalletType(walletType)
      } catch (error) {
        console.log(error)
      }
    },
    [isConnectedWagmi, signerWagmi]
  )

  // Disconnect
  const disconnectLocalWallet = () => {
    setLocalMycelWallet(undefined)
    setHdKey(undefined)
  }

  const disconnectWallet = useCallback(async () => {
    if (isConnectedWagmi) await disconnectWagmi()
    updateEvmAddress(undefined)
    updateMycelAddress(undefined)
    disconnectLocalWallet()
    // forgetEvmSignature();
    updateCurrentWalletType(undefined)
  }, [isConnectedWagmi])

  // mycel wallet
  const [localMycelWallet, setLocalMycelWallet] = useState<LocalWallet>()
  const [mycelOfflineSigner, setMycelOfflineSigner] = useState<OfflineSigner>()
  const [mycelOfflineSignerAmino, setMycelOfflineSignerAmino] =
    useState<OfflineAminoSigner>()
  const [hdKey, setHdKey] = useState<PrivateInformation>()

  const mycelAccounts = useMemo(
    () => localMycelWallet?.accounts,
    [localMycelWallet]
  )

  const getWalletFromEvmSignature = async ({
    signature,
  }: {
    signature: string
  }) => {
    const { mnemonic, privateKey, publicKey } =
      onboarding.deriveHDKeyFromEthereumSignature(signature)

    return {
      wallet: await LocalWallet.fromMnemonic(mnemonic, BECH32_PREFIX),
      mnemonic,
      privateKey,
      publicKey,
    }
  }

  const setWalletFromEvmSignature = async (signature: string) => {
    const { wallet, mnemonic, privateKey, publicKey } =
      await getWalletFromEvmSignature({
        signature,
      })
    setLocalMycelWallet(wallet)
    setHdKey({ mnemonic, privateKey, publicKey })
    setMycelOfflineSigner(
      await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: BECH32_PREFIX,
      })
    )
    setMycelOfflineSignerAmino(
      await Secp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: BECH32_PREFIX,
      })
    )
  }

  const saveEvmSignature = useCallback(
    (encryptedSignature: string) => {
      if (evmAddress) {
        updateEvmDerivedAddress({
          evmAddress,
          mycelAddress,
          encryptedSignature,
        })
      }
    },
    [evmDerivedAddresses, evmAddress]
  )

  const forgetEvmSignature = useCallback(
    (_evmAddress = evmAddress) => {
      if (_evmAddress) {
        updateEvmDerivedAddress({
          evmAddress: _evmAddress,
          mycelAddress,
          encryptedSignature: undefined,
        })
      }
    },
    [evmDerivedAddresses, evmAddress]
  )

  const { signTypedDataAsync } = useSignTypedData()
  const types = getTypedData()

  const deriveKeys = async () => {
    const signature = await signTypedDataAsync({
      ...types,
      domain: {
        ...types.domain,
        chainId: EVM_CHAINID,
      },
    })
    await setWalletFromEvmSignature(signature)
    const encryptedSignature = AES.encrypt(
      signature,
      staticEncryptionKey
    ).toString()
    saveEvmSignature(encryptedSignature)
  }

  const decryptSignature = (encryptedSignature: string | undefined) => {
    if (!staticEncryptionKey) throw new Error('No decryption key found')
    if (!encryptedSignature) throw new Error('No signature found')

    const decrypted = AES.decrypt(encryptedSignature, staticEncryptionKey)
    const signature = decrypted.toString(enc.Utf8)
    return signature
  }

  const signDomainName = useCallback(
    async (domainName: string) => {
      if (mycelOfflineSignerAmino) {
        const account = await mycelOfflineSignerAmino.getAccounts()
        const signData = getSignDomainData(account[0].address, domainName)
        console.log('signData', signData, account[0].address)
        const signature = await mycelOfflineSignerAmino.signAmino(
          account[0].address,
          signData
        )
        return signature
      }
    },
    [mycelOfflineSignerAmino]
  )

  useEffect(() => {
    if (evmAddressWagmi) {
      if (evmAddress && evmAddress !== evmAddressWagmi) {
        disconnectLocalWallet()
        forgetEvmSignature(evmAddressWagmi)
      }
      updateEvmAddress(evmAddressWagmi)
    }
    if (mycelAddress) {
      updateMycelAddress(mycelAddress)
    }
  }, [evmAddressWagmi, mycelAddress])

  // Change EVM network
  const { chain: chainWagmi } = useAccountWagmi()
  const { switchChainAsync } = useSwitchChainWagmi()
  const switchEvmNetworkAsync = useCallback(
    async (chainId: number) => {
      if (chainWagmi?.id !== chainId) {
        switchChainAsync && (await switchChainAsync({ chainId }))
      }
    },
    [chainWagmi?.id]
  )

  // LocalWallet
  useEffect(() => {
    ;(async () => {
      if (evmAddress) {
        if (!localMycelWallet) {
          const evmDerivedAccount = evmDerivedAddresses[evmAddress]
          if (evmDerivedAccount?.encryptedSignature) {
            try {
              const signature = decryptSignature(
                evmDerivedAccount.encryptedSignature
              )
              await setWalletFromEvmSignature(signature)
            } catch (error) {
              console.log(error)
              forgetEvmSignature()
            }
          }
        }
      }
    })()
  }, [evmAddress, evmDerivedAddresses, signerWagmi, mycelAddress])

  // mint
  // TODO: use env variable
  const contractAddress = '0x843f17358072d0ce2FB387Ef376dc984673f23Ee'
  const contractABI = [
    {
      constant: true,
      inputs: [
        {
          name: 'owner',
          type: 'address',
        },
      ],
      name: 'balanceOf',
      outputs: [
        {
          name: '',
          type: 'uint256',
        },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
  ]

  const { data: nftBalance } = useReadContract({
    address: contractAddress,
    abi: contractABI,
    functionName: 'balanceOf',
    args: [evmAddressWagmi],
  })

  const hasMintedNFT = useMemo(() => {
    return (
      (typeof nftBalance === 'number' || typeof nftBalance === 'bigint') &&
      nftBalance > 0
    )
  }, [nftBalance])

  return {
    // Wallet connection
    isConnected: isConnectedWagmi,
    isConnectedWagmi,
    isConnectingWagmi,
    isReconnectingWagmi,
    connectWallet,
    disconnectWallet,
    currentWalletType,
    // EVM
    evmAddress,
    evmAddressWagmi,
    signerWagmi,
    connectorsWagmi,
    evmChainId: chainWagmi?.id,
    switchEvmNetworkAsync,
    balance: balance.data?.value,
    // EVM Transaction
    hash,
    sendTransaction,
    receipt,
    receiptError,
    receiptLoading,
    receiptSuccess,
    // Cosmos
    mycelAddress,
    // EVM → mycel account derivation
    setWalletFromEvmSignature,
    saveEvmSignature,
    // forgetEvmSignature,
    deriveKeys,
    signDomainName,
    // mycel accounts
    hdKey,
    localMycelWallet,
    mycelOfflineSigner,
    mycelAccount: mycelAccounts?.[0],
    // mint
    hasMintedNFT,
  }
}
