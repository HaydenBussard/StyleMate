/**
 * In-process MaiaBackend for Node (tests and evaluation scripts).
 * Same model code as the browser worker, minus the worker.
 */
import { loadMaia, maiaPolicy, type MaiaModel } from "../vendor/maia3/index";
import type { MaiaBackend, MaiaPolicyInput, MaiaPolicyOutput } from "./maia3";

export class DirectMaiaBackend implements MaiaBackend {
  private model: MaiaModel;
  calls = 0;

  constructor(weights: ArrayBuffer) {
    this.model = loadMaia(weights);
  }

  async policy(input: MaiaPolicyInput): Promise<MaiaPolicyOutput> {
    this.calls++;
    return maiaPolicy(this.model, input);
  }
}
