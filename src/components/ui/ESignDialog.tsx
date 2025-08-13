import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './dialog'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { uploadDocument, addSigner, getSigningUrl } from '@/lib/documensoClient'
import { supabase } from '@/integrations/supabase/client'
import { useDocument } from '@/hooks/useDocuments'
import { Spinner } from './spinner'

interface ESignDialogProps {
  documentId: string
}

interface FormData {
  signerName: string
  signerEmail: string
}

export function ESignDialog({ documentId }: ESignDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [signUrl, setSignUrl] = React.useState<string>()
  const { data: doc, isLoading } = useDocument(documentId)
  const { register, handleSubmit } = useForm<FormData>()

  async function onSubmit(values: FormData) {
    if (!doc || !doc.file_path) return
    try {
      // download file from Supabase storage
      const { data: downloaded, error: downloadError } = await supabase
        .storage.from('documents')
        .download(doc.file_path)
      if (downloadError || !downloaded) throw downloadError || new Error('No data')

      const fileBlob = await downloaded.arrayBuffer()
      const file = new File(
        [fileBlob],
        doc.title + (doc.file_type ? '.' + doc.file_type : ''),
        { type: doc.file_type || 'application/pdf' }
      )

      // upload to Documenso
      const { id: remoteDocId } = await uploadDocument(file)
      // add signer
      const { recipientId } = await addSigner(remoteDocId, {
        name: values.signerName,
        email: values.signerEmail,
      })
      // get signing URL
      const { url } = await getSigningUrl(remoteDocId, recipientId)
      setSignUrl(url)
    } catch (err: any) {
      console.error('eSign failure', err)
      alert('Failed to initiate e-signature: ' + err.message)
    }
  }

  if (isLoading) return <Spinner />

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">ESign</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send for E-Signature</DialogTitle>
        </DialogHeader>
        {signUrl ? (
          <div className="space-y-4">
            <p className="font-medium">Signing link generated!</p>
            <a
              href={signUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button>Open Signing Page</Button>
            </a>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="grid gap-4"
          >
            <div className="grid gap-1">
              <Label htmlFor="signerName">Signer Name</Label>
              <Input
                id="signerName"
                {...register('signerName', { required: true })}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="signerEmail">Signer Email</Label>
              <Input
                id="signerEmail"
                type="email"
                {...register('signerEmail', { required: true })}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Generate Link</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}