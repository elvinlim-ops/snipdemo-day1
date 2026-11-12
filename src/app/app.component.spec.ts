import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { API_BASE_URL, Link } from './links-api.service';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3000' }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('rejects invalid URLs without submitting them', () => {
    component.urlControl.setValue('ftp://example.com');
    component.submit();

    expect(component.urlControl.invalid).toBeTrue();
    http.expectNone({ method: 'POST', url: 'http://localhost:3000/api/links' });
  });

  it('creates a short link and refreshes the links table', () => {
    const link: Link = {
      code: 'ab12CD',
      url: 'https://example.com/a/long/path',
      shortUrl: 'http://localhost:3000/ab12CD',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z'
    };
    component.urlControl.setValue(link.url);
    component.submit();

    const createRequest = http.expectOne('http://localhost:3000/api/links');
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({ url: link.url });
    createRequest.flush(link);

    const refreshRequest = http.expectOne('http://localhost:3000/api/links');
    expect(refreshRequest.request.method).toBe('GET');
    refreshRequest.flush([link]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.success a')?.getAttribute('href')).toBe(link.shortUrl);
    expect(element.querySelector('tbody .short-link')?.textContent?.trim()).toBe(link.code);
    expect(element.querySelector('tbody .hits-column')?.textContent?.trim()).toBe('0');
    expect(element.querySelector('.original-url')?.textContent).toContain(link.url);
  });

  it('shows backend validation errors beside the URL field', () => {
    component.urlControl.setValue('https://example.com');
    component.submit();
    http.expectOne('http://localhost:3000/api/links').flush(
      { error: 'The URL is not accepted.' },
      { status: 400, statusText: 'Bad Request' }
    );
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#url-server-error')?.textContent).toContain('The URL is not accepted.');
    expect(element.querySelector('#url')?.getAttribute('aria-invalid')).toBe('true');
  });
});
