import { useState, useEffect } from 'react'
import { createLazyFileRoute } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import ImgIntro from '@/assets/spore-intro.svg'
import ImgLogo from '@/assets/spore-logo.svg'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useMycel'
import { useDomainOwnership } from '@/hooks/useMycel'
import { toast } from '@/components/ui/sonner'
import { shortAddress } from '@/lib/wallets'
import { copyClipboard, cn } from '@/lib/utils'
import { ClipboardCopy } from 'lucide-react'
import Button from '~/components/Button'
import CelNameForm from '~/components/form/CelName'
import RefCodeForm from '~/components/form/RefCode'
import {
  MYCEL_COIN_DECIMALS,
  MYCEL_HUMAN_COIN_UNIT,
  convertToDecimalString,
} from '@/lib/coin'
import { convertDomainToString } from '@/lib/domainName'
import { useStore } from '@/store'
import { useNavigate } from '@tanstack/react-router'
import { useGetUser } from '@/hooks/useReferral'

export const Route = createLazyFileRoute('/start')({
  component: Start,
})

function Start() {
  const THRESHOLD: number =
    import.meta.env.VITE_FAUCET_CLAIMABLE_THRESHOLD ?? 1000000
  const [isClaimable, setIsClaimable] = useState<boolean>(false)
  const { isLoading: isLoadingBalance, data: dataBalance } = useBalance()
  const { mycelAccount, isConnected, disconnectWallet } = useWallet()
  const mycelName = useStore((state) => state.mycelName)
  const { isLoading: isLoadingReferral, data: dataReferral } = useGetUser(
    mycelName ?? ''
  )
  const navigate = useNavigate()

  useEffect(() => {
    if (BigInt(dataBalance?.balance?.amount ?? 0) < BigInt(THRESHOLD)) {
      setIsClaimable(true)
    } else {
      setIsClaimable(false)
    }
  }, [isLoadingBalance, dataBalance, THRESHOLD, isClaimable])

  // redirect to home if user already has a mycel address
  useEffect(() => {
    if (
      mycelAccount?.address &&
      isConnected &&
      !isLoadingReferral &&
      dataReferral?.data
    ) {
      navigate({ to: '/home' })
    }
  }, [mycelAccount, isConnected, dataReferral, isLoadingReferral, navigate])

  const handleSignout = async (): Promise<void> => {
    await disconnectWallet()
    navigate({ to: '/' })
  }

  return (
    <div className="min-h-screen sm:max-w-screen-sm mx-auto py-8 px-4 sm:px-6">
      <img src={ImgLogo} className="h-16 mx-auto mb-6" />
      <div className="bg-light overlay-dot-ll px-6 py-10 rounded-2xl">
        <img src={ImgIntro} className="mx-auto max-w-sm mt-4 mb-8 px-10" />
        <div>
          <ol className="list-decimal text-xl font-title list-inside space-y-6 px-4">
            <li>
              <Create />
            </li>
            <li>
              <Mint
                isClaimable={isClaimable}
                balance={BigInt(dataBalance?.balance?.amount ?? 0)}
              />
            </li>
            <li>
              <RegisterCelName
                balance={BigInt(dataBalance?.balance?.amount ?? 0)}
              />
            </li>
            <li>
              <CheckRefCode isClaimable={isClaimable} />
            </li>
          </ol>
        </div>
      </div>
      <div className="px-4 sm:px-6 pb-6">
        <div className="list-decimal text-xl font-title p-4">
          <span>Having trouble?</span>
          <button
            onClick={handleSignout}
            className="btn bg-secondary py-2 px-6 h-14 w-full mt-6"
          >
            <span className="btn-inner" />
            <div className="flex items-center font-title text-xl">
              <LogOut size={28} strokeWidth={3} className="mr-4" />
              Disconnect
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

function Create() {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const { deriveKeys, mycelAccount, switchEvmNetworkAsync } = useWallet()

  const createMycelAddress = async () => {
    setIsLoading(true)

    await switchEvmNetworkAsync(1)

    try {
      await deriveKeys()
    } catch {
      setIsLoading(false)
      toast('⚠️ User rejected the signature request.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <span className={cn(!!mycelAccount?.address && 'line-through')}>
        Create mycel address
      </span>
      {!mycelAccount ? (
        <Button
          type="button"
          isLoading={isLoading}
          className="bg-secondary w-full h-14 mt-2"
          onClick={async () => await createMycelAddress()}
          disabled={!!mycelAccount}
        >
          Create
        </Button>
      ) : (
        <div className="relative">
          <input
            readOnly
            type="text"
            className="w-full mt-2"
            value={shortAddress(mycelAccount.address, 8)}
          />
          <button
            onClick={() => {
              copyClipboard(mycelAccount.address)
              toast(`Address "${shortAddress(mycelAccount.address)}" copied!`)
            }}
          >
            <ClipboardCopy
              strokeWidth={3}
              size={26}
              className="text-light absolute right-5 bottom-4 z-10"
            />
          </button>
        </div>
      )}
    </>
  )
}

function Mint({
  isClaimable,
  balance,
}: {
  isClaimable: boolean
  balance: bigint
}) {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const { mycelAccount } = useWallet()

  const claimFaucet = async () => {
    if (isClaimable && mycelAccount?.address) {
      try {
        await fetch(
          `${import.meta.env.VITE_FAUCET_URL!}/faucet?address=${mycelAccount?.address}`
        ).then((res) => {
          console.log('faucet MYCEL succeeded!', res)
          toast('👌 MYCEL Minted!')
        })
      } catch (e) {
        console.error('faucet error: ', e)
        toast('⚠️ Mint MYCEL error!')
      }
    } else {
      toast('⚠️ You have enough balance')
      // setTxResponse({
      //   code: -1,
      //   rawLog: 'You have enough balance',
      // } as DeliverTxResponse)
    }
  }

  const mintTestToken = async () => {
    setIsLoading(true)
    try {
      await claimFaucet()
    } catch (e) {
      toast('⚠️ Mint error!')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <span className={cn(!isClaimable ? 'line-through' : undefined)}>
        Mint test token
      </span>
      {!isClaimable && !isLoading ? (
        <>
          <p className="text-right font-title text-3xl font-bold">
            {convertToDecimalString(balance ?? 0, MYCEL_COIN_DECIMALS)}
            <span clasName="text-xl ml-1.5">{MYCEL_HUMAN_COIN_UNIT}</span>
          </p>
        </>
      ) : (
        <Button
          type="button"
          isLoading={isLoading}
          disabled={!isClaimable}
          className="btn bg-secondary w-full h-14 mt-2"
          onClick={async () => await mintTestToken()}
        >
          Mint
        </Button>
      )}
    </>
  )
}

function RegisterCelName({ balance }: { balance: bigint }) {
  const { mycelAccount } = useWallet()
  const { isLoading: isLoadingOwnDomain, data: dataOwnDomain } =
    useDomainOwnership(mycelAccount?.address)
  const mycelName = useStore((state) => state.mycelName)
  const updateMycelName = useStore((state) => state.updateMycelName)

  useEffect(() => {
    // set mycelName (xxx.cel)
    const mycelName = dataOwnDomain?.domain_ownership?.domains[0]
    if (mycelName) {
      updateMycelName(convertDomainToString(mycelName))
    }
  }, [dataOwnDomain, isLoadingOwnDomain, updateMycelName])
  return (
    <>
      <span className={cn(mycelName ? 'line-through' : '')}>Get your name</span>
      {!isLoadingOwnDomain && mycelName ? (
        <p className="text-right font-title text-3xl font-bold">{mycelName}</p>
      ) : (
        <CelNameForm balance={balance} forceLowercase={true} />
      )}
    </>
  )
}

function CheckRefCode({ isClaimable }: { isClaimable: boolean }) {
  return (
    <>
      <span className={cn('')}>Refferal code</span>
      <RefCodeForm isClaimable={isClaimable} />
    </>
  )
}
