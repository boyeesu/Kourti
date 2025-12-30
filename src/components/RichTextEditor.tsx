import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    List,
    ListOrdered,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Undo,
    Redo,
    Highlighter,
} from 'lucide-react';
import { useEffect } from 'react';

interface RichTextEditorProps {
    content: string;
    onChange: (content: string) => void;
    editable?: boolean;
}

export function RichTextEditor({ content, onChange, editable = true }: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Preserve formatting better
                heading: {
                    levels: [1, 2, 3, 4, 5, 6],
                },
                paragraph: {
                    HTMLAttributes: {
                        class: 'mb-4',
                    },
                },
            }),
            Underline,
            Highlight.configure({ multicolor: true }),
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
        ],
        content,
        editable,
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none',
            },
        },
        onUpdate: ({ editor }: { editor: Editor }) => {
            onChange(editor.getHTML());
        },
        parseOptions: {
            preserveWhitespace: 'full',
        },
    });

    useEffect(() => {
        if (editor && content && content !== editor.getHTML()) {
            // Preserve the original content structure
            editor.commands.setContent(content);
        }
    }, [content, editor]);

    if (!editor) {
        return null;
    }

    return (
        <div className="border rounded-lg overflow-hidden">
            {editable && (
                <div className="bg-muted/30 border-b p-2 flex flex-wrap gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={editor.isActive('bold') ? 'bg-muted' : ''}
                    >
                        <Bold className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={editor.isActive('italic') ? 'bg-muted' : ''}
                    >
                        <Italic className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        className={editor.isActive('underline') ? 'bg-muted' : ''}
                    >
                        <UnderlineIcon className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleHighlight().run()}
                        className={editor.isActive('highlight') ? 'bg-muted' : ''}
                    >
                        <Highlighter className="h-4 w-4" />
                    </Button>

                    <Separator orientation="vertical" className="h-8 mx-1" />

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={editor.isActive('bulletList') ? 'bg-muted' : ''}
                    >
                        <List className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={editor.isActive('orderedList') ? 'bg-muted' : ''}
                    >
                        <ListOrdered className="h-4 w-4" />
                    </Button>

                    <Separator orientation="vertical" className="h-8 mx-1" />

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                        className={editor.isActive({ textAlign: 'left' }) ? 'bg-muted' : ''}
                    >
                        <AlignLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                        className={editor.isActive({ textAlign: 'center' }) ? 'bg-muted' : ''}
                    >
                        <AlignCenter className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                        className={editor.isActive({ textAlign: 'right' }) ? 'bg-muted' : ''}
                    >
                        <AlignRight className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                        className={editor.isActive({ textAlign: 'justify' }) ? 'bg-muted' : ''}
                    >
                        <AlignJustify className="h-4 w-4" />
                    </Button>

                    <Separator orientation="vertical" className="h-8 mx-1" />

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                    >
                        <Undo className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                    >
                        <Redo className="h-4 w-4" />
                    </Button>
                </div>
            )}
            <EditorContent
                editor={editor}
                className="prose max-w-none p-4 min-h-[400px] focus:outline-none"
            />
            <style>{`
        .ProseMirror {
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }
      `}</style>
        </div>
    );
}
