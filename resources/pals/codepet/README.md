# Bundled Pals

Cat, Robot, and Axolotl are adapted from the stage-2 pose packs in Greyforge
Labs' [CodePet](https://github.com/GreyforgeLabs/codepet/tree/1127a02082e217d9c0f58e4d1a504539662330f4/qml/assets/pets).
The pinned source revision is `1127a02082e217d9c0f58e4d1a504539662330f4`.
See `LICENSE` for the MIT terms and `PROVENANCE.md` for the authors' asset
provenance statement. The authors note that the legal suitability of the
generated assets has not been independently reviewed.

The atlases are generated with `scripts/convert-codepet-pals.py` and Pillow:

```sh
python3 scripts/convert-codepet-pals.py \
  /path/to/codepet/qml/assets/pets resources/pals/codepet \
  --revision 1127a02082e217d9c0f58e4d1a504539662330f4
```

Each atlas is eight columns by nine rows. Rows represent idle, right, left
(mirrored right), celebrate, play, error, waiting, working, and review (working).
