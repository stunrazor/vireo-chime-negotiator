import { useState, type FormEvent } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { Button } from '@workspace/vireo-design-system/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/vireo-design-system/components/ui/dialog';
import { Input } from '@workspace/vireo-design-system/components/ui/input';
import { askChime, type ChimeKnowledgeAnswer } from '@/lib/vireo-api';

export function ChimeAskPanel() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<ChimeKnowledgeAnswer>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const openPanel = () => {
    setQuestion('');
    setAnswer(undefined);
    setError('');
    setOpen(true);
  };

  const ask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || loading) return;
    setLoading(true);
    setError('');
    setAnswer(undefined);
    try {
      setAnswer(await askChime(trimmedQuestion));
    } catch {
      setError("Chime couldn't prepare a grounded answer. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={openPanel}
        data-testid="button-ask-chime"
      >
        <MessageCircleQuestion aria-hidden="true" />
        Ask Chime
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(85vh,720px)] overflow-y-auto sm:max-w-xl">
          <DialogHeader className="text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Vireo’s Workspace Agent</p>
            <DialogTitle>Ask Chime</DialogTitle>
            <DialogDescription>
              Ask about Vireo.
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-3" onSubmit={ask}>
            <label className="grid gap-2 text-sm font-medium" htmlFor="chime-question">
              Your question
              <Input
                id="chime-question"
                data-testid="input-chime-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={240}
                placeholder="For example: How are quotes ranked?"
                autoComplete="off"
                disabled={loading}
              />
            </label>
            <DialogFooter className="sm:justify-start">
              <Button type="submit" disabled={!question.trim() || loading} data-testid="button-submit-chime-question">
                {loading ? 'Chime is thinking…' : 'Ask'}
              </Button>
            </DialogFooter>
          </form>

          {error && <p role="alert" data-testid="status-chime-error" className="text-sm text-destructive">{error}</p>}
          {answer && (
            <section className="grid gap-3 rounded-lg border bg-muted/30 p-4" aria-live="polite" data-testid="panel-chime-answer">
              <p className="text-sm leading-relaxed whitespace-pre-line" data-testid="text-chime-answer">
                {answer.answer}
              </p>
              {answer.source_sections.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label="Knowledge guide sections">
                  {[...new Set(answer.source_sections)].map((section) => (
                    <span key={section} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground" data-testid="source-chime-section">
                      {section}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Answers are direct excerpts from Vireo’s approved guide. If a detail is not covered there, Chime will say so.
              </p>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
