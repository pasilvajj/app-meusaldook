import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-reports-hub',
  standalone: true,
  imports: [RouterLink, MatCardModule, MatIconModule, MatSnackBarModule],
  templateUrl: './reports-hub.component.html',
  styleUrl: './reports-hub.component.scss',
})
export class ReportsHubComponent {
  private readonly snack = inject(MatSnackBar);

  comingSoon(label: string): void {
    this.snack.open(`${label} — disponível em breve.`, 'OK', { duration: 3200 });
  }
}
