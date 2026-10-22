import { useAppStore } from "@/stores/app";
import { useSessionStore } from "@/stores/session";

export type InputModalRequest = {
  inputType: string;
  inputModal: string;
  inputData: Record<string, unknown>;
};

export type InputModalResult = Array<string | number> | boolean;

export function requestInputModal({
  inputType,
  inputModal,
  inputData,
}: InputModalRequest): Promise<InputModalResult> {
  const appStore = useAppStore();
  const sessionStore = useSessionStore();

  return new Promise<InputModalResult>((resolve, reject) => {
    sessionStore.setInputResolver((value) => resolve(value as InputModalResult));
    sessionStore.setInputRejecter(reject);
    sessionStore.setInputType(inputType);
    sessionStore.setInputModal(inputModal);
    sessionStore.setInputData(inputData);

    if (appStore.grimoire.isMenuOpen) {
      appStore.toggleMenu(false);
    }
    appStore.toggleModal("input");
  });
}
