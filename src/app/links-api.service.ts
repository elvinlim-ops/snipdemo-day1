import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

export interface Link {
  code: string;
  url: string;
  shortUrl: string;
  hits: number;
  createdAt: string;
}

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

@Injectable({ providedIn: 'root' })
export class LinksApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/+$/, '');
  }

  listLinks(): Observable<Link[]> {
    return this.http.get<Link[]>(`${this.baseUrl}/api/links`);
  }

  createLink(url: string): Observable<Link> {
    return this.http.post<Link>(`${this.baseUrl}/api/links`, { url });
  }
}
