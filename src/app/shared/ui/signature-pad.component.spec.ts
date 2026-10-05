import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule } from "@ngx-translate/core";
import { SignaturePadComponent } from "./signature-pad.component";

describe("SignaturePadComponent", () => {
  let fixture: ComponentFixture<SignaturePadComponent>;
  let component: SignaturePadComponent;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SignaturePadComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(SignaturePadComponent);
    component = fixture.componentInstance;
    // Give the pad a real size: the test page has no layout of its own.
    fixture.nativeElement.style.width = "400px";
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    canvas = fixture.nativeElement.querySelector("canvas");
  });

  afterEach(() => fixture.nativeElement.remove());

  function pointer(type: string, x: number, y: number): void {
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent(type, {
      clientX: rect.left + x, clientY: rect.top + y, pointerId: 1, pointerType: "pen", button: 0, bubbles: true,
    }));
  }

  function sign(): void {
    pointer("pointerdown", 40, 100);
    pointer("pointermove", 80, 60);
    pointer("pointermove", 140, 110);
    pointer("pointermove", 220, 70);
    pointer("pointerup", 220, 70);
  }

  it("starts empty, with a hint", () => {
    expect(component.empty()).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain("signature_pad.hint");
  });

  it("hands out the drawn signature as a PNG once a stroke ends", async () => {
    const file = new Promise<File | null>((resolve) => component.signed.subscribe(resolve));

    sign();
    const signature = await file;

    expect(component.empty()).toBeFalse();
    expect(signature).toEqual(jasmine.any(File));
    expect(signature!.type).toBe("image/png");
    expect(signature!.size).toBeGreaterThan(0);
  });

  it("crops the signature to the ink rather than the whole pad", async () => {
    const file = new Promise<File | null>((resolve) => component.signed.subscribe(resolve));
    sign();
    const signature = (await file)!;

    const bitmap = await createImageBitmap(signature);
    expect(bitmap.width).toBeLessThan(canvas.width);
  });

  it("says when it has been cleared", () => {
    const emitted: (File | null)[] = [];
    component.signed.subscribe((value) => emitted.push(value));
    pointer("pointerdown", 40, 100);
    pointer("pointerup", 40, 100);

    component.clear();

    expect(component.empty()).toBeTrue();
    expect(emitted.at(-1)).toBeNull();
  });
});
