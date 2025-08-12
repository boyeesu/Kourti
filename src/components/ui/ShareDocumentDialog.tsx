import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './dialog'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { useForm } from 'react-hook-form'
import { shareDocument } from '@/lib/documensoClient'
import { useToast } from '@/hooks/use-toast'

interface ShareDocumentProps {
  documentId: string
  children?: React.ReactNode
}

interface FormData {
  email: string
  message: string
}

export function ShareDocumentDialog({ documentId, children }: ShareDocumentProps) {
  const [open, setOpen] = React.useState(false)
  const { toast } = useToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>()

  async function onSubmit(data: FormData) {
    try {
      await shareDocument(documentId, data.email, data.message)
      toast({ title: 'Document shared', description: 'Email sent successfully.' })
      setOpen(false)
      reset()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to share document.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="ghost" size="icon">
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <div className="grid gap-1">
            <Label htmlFor="email">Recipient’s Email</Label>
            <Input
              id="email"
              type="email"
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Invalid email address',
                },
              })}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email.message}</p>
            )}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="message">Message (optional)</Label>
            <Input
              id="message"
              {...register('message', {
                maxLength: { value: 500, message: 'Message is too long' },
              })}
            />
            {errors.message && (
              <p className="text-sm text-red-500">{errors.message.message}</p>
            )}
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setOpen(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Send
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
