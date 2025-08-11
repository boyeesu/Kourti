import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './dialog'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { useForm } from 'react-hook-form'

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
  const { register, handleSubmit, reset } = useForm<FormData>()

  function onSubmit(data: FormData) {
    // TODO: call share API
    console.log('Share', documentId, data)
    setOpen(false)
    reset()
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
            <Input id="email" type="email" {...register('email', { required: true })} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="message">Message (optional)</Label>
            <Input id="message" {...register('message')} />
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Send</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
