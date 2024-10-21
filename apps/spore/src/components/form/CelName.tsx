import React from 'react'
import { useState } from 'react'
import { toast } from '@/components/ui/sonner'
import Button from '~/components/Button'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRegisterSecondLevelDomain } from '@/hooks/useMycel'

const celNameSchema = z.object({
  // TODO: update with server validation
  domain: z
    .string()
    .min(1, "Name can't be empty")
    .max(64, "Name can't be longer than 64 characters")
    .regex(/^[a-zA-Z0-9]*$/, {
      message: 'Only alphanumeric characters are allowed.',
    }),
})

interface CelNameFormProps {
  balance: bigint
  forceLowercase?: boolean
}

const CelNameForm: React.FC<CelNameFormProps> = ({ balance, forceLowercase = false }) => {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const { mutateAsync } = useRegisterSecondLevelDomain()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(celNameSchema),
  })

  const [inputValue, setInputValue] = useState<string>('')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = forceLowercase ? e.target.value.toLowerCase() : e.target.value
    setInputValue(value)
  }

  const onSubmit = async (data: any) => {
    setIsLoading(true)
    try {
      await mutateAsync(data.domain)
      toast(`👌 You got ${data.domain} !`)
    } catch (e) {
      toast(`⚠️ Register error! ${e.message}`)
    }
    setIsLoading(false)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="flex">
        <input
          type="text"
          placeholder="xxx"
          className="w-full mt-2"
          {...register('domain')}
          value={inputValue}
          onChange={handleInputChange}
        />
        <span className="ml-2 pt-8 text-2xl">.cel</span>
      </div>
      {errors.domain && (
        <span className="font-sans text-right text-sm bg-primary px-2 pt-px mt-1 mx-2 inline-flex">
          {errors.domain.message}
        </span>
      )}
      <Button
        type="submit"
        isLoading={isLoading}
        disabled={balance <= 0}
        className="btn bg-secondary w-full h-14 mt-2"
      >
        Get .cel name
      </Button>
    </form>
  )
}

export default CelNameForm
