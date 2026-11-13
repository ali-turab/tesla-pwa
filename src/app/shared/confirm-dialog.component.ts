import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConfirmService } from './confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'confirm.answer(false)' },
  template: `
    @if (confirm.pending(); as req) {
      <div class="overlay" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
        <div class="modal">
          <h2 id="confirm-title">{{ req.title }}</h2>
          <p id="confirm-msg" class="muted">{{ req.message }}</p>
          <div class="row">
            <button class="btn btn-grow" type="button" (click)="confirm.answer(false)">Cancel</button>
            <button
              class="btn btn-grow"
              [class.btn-danger]="req.danger"
              [class.btn-primary]="!req.danger"
              type="button"
              (click)="confirm.answer(true)"
            >
              {{ req.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialogComponent {
  protected readonly confirm = inject(ConfirmService);
}
