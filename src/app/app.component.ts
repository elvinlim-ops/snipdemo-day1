import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { Link, LinksApiService } from './links-api.service';

const httpUrlValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname
      ? null
      : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  readonly urlControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, httpUrlValidator]
  });
  readonly form = new FormGroup({ url: this.urlControl });
  readonly links = signal<Link[]>([]);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly submissionAttempted = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);
  readonly createdShortUrl = signal<string | null>(null);

  private refreshQueued = false;

  constructor(private readonly linksApi: LinksApiService) {}

  ngOnInit(): void {
    this.refreshLinks();
  }

  refreshLinks(): void {
    if (this.loading()) {
      this.refreshQueued = true;
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);
    this.linksApi.listLinks().subscribe({
      next: (links) => {
        this.links.set(links);
        this.finishLoading();
      },
      error: (error: unknown) => {
        this.loadError.set(this.errorMessage(error));
        this.finishLoading();
      }
    });
  }

  submit(): void {
    this.submissionAttempted.set(true);
    this.submitError.set(null);
    this.createdShortUrl.set(null);

    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.linksApi.createLink(this.urlControl.value.trim()).subscribe({
      next: (link) => {
        this.createdShortUrl.set(link.shortUrl);
        this.urlControl.reset();
        this.submissionAttempted.set(false);
        this.submitting.set(false);
        this.refreshLinks();
      },
      error: (error: unknown) => {
        this.submitError.set(this.errorMessage(error));
        this.submitting.set(false);
      }
    });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
        return body.error;
      }
      if (error.status === 0) {
        return 'Could not reach the Snip API. Check that the backend is running and try again.';
      }
      return `The request failed (${error.status}). Please try again.`;
    }

    return 'Something went wrong. Please try again.';
  }

  private finishLoading(): void {
    this.loading.set(false);
    if (this.refreshQueued) {
      this.refreshQueued = false;
      this.refreshLinks();
    }
  }
}
