import { ReactNode, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Maximize2, Minimize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import html2canvas from 'html2canvas';

interface EnhancedChartProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  exportable?: boolean;
  exportFileName?: string;
  fullscreenable?: boolean;
  chartId?: string;
}

export function EnhancedChart({
  title,
  description,
  children,
  className,
  exportable = true,
  exportFileName = 'chart',
  fullscreenable = true,
  chartId,
}: EnhancedChartProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!chartId) return;
    setIsExporting(true);
    try {
      const element = document.getElementById(chartId);
      if (!element) return;

      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
      });

      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${exportFileName}-${new Date().toISOString().split('T')[0]}.png`;
      link.href = url;
      link.click();
    } catch (error) {
      console.error('Error exporting chart:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const chartContent = (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {exportable && (
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>
          )}
          {fullscreenable && (
            <Button variant="outline" size="sm" onClick={() => setIsFullscreen(true)}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div id={chartId}>{children}</div>
    </div>
  );

  return (
    <>
      <Card className="shadow-sm">
        <CardContent className="p-6">{chartContent}</CardContent>
      </Card>

      {fullscreenable && (
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent
            className="max-w-7xl max-h-[90vh] overflow-auto"
            aria-describedby={undefined}
          >
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">{title}</h2>
                {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
              </div>
              <div className="flex items-center gap-2">
                {exportable && (
                  <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setIsFullscreen(false)}>
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg">{children}</div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
