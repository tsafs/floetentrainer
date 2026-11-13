# Melodien: Ton + Dauer (1/2/4/8/16), Punkt, r = Pause, | Taktstrich, || Schluss,
# / Zeilenumbruch, ( ) Bindebogen (Melisma), ~ Haltebogen, , Atemzeichen, T4/4 Taktwechsel.
# |: und :| Wiederholungszeichen (Beginn/Ende des zu wiederholenden Teils).
# stanzas: weitere Strophen, Zeilen mit " / " getrennt.
SONGS = [
    dict(chapter="Kinder- und Weihnachtslieder",
         title="Kuckuck, Kuckuck, ruft’s aus dem Wald", key="G", keyname="G-Dur", time=(3, 4),
         credit="Text: Hoffmann von Fallersleben · Melodie: Volksweise",
         music="d''2 h'4 | d''2 h'4 | a'4 g'4 a'4 | g'2. , | / a'4 a'4 h'4 | c''2 a'4 , | h'4 h'4 c''4 | d''2 h'4 , | / "
               "d''2 h'4 | d''2 h'4 | c''4 h'4 a'4 | g'2. ||",
         lyrics="Ku-ckuck, Ku-ckuck, ruft’s aus dem Wald. Las-set uns sin-gen, tan-zen und sprin-gen! "
                "Früh-ling, Früh-ling wird es nun bald.",
         stanzas=["Kuckuck, Kuckuck lässt nicht sein Schrein: / Komm in die Felder, / Wiesen und Wälder! / Frühling, Frühling, stelle dich ein!",
                  "Kuckuck, Kuckuck, trefflicher Held! / Was du gesungen, / ist dir gelungen: / Winter, Winter räumet das Feld!"]),
    dict(title="Hänschen klein", key="G", keyname="G-Dur", time=(4, 4),
         credit="Text: Franz Wiedemann · Melodie: Volksweise",
         music="d''4 h'4 h'2 | c''4 a'4 a'2 | g'4 a'4 h'4 c''4 | d''4 d''4 d''2 , | / "
               "d''4 h'4 h'2 | c''4 a'4 a'2 | g'4 h'4 d''4 d''4 | g'1 , | / "
               "a'4 a'4 a'4 a'4 | a'4 h'4 c''2 , | h'4 h'4 h'4 h'4 | h'4 c''4 d''2 , | / "
               "d''4 h'4 h'2 | c''4 a'4 a'2 | g'4 h'4 d''4 d''4 | g'1 ||",
         lyrics="Häns-chen klein ging al-lein in die wei-te Welt hin-ein. Stock und Hut steht ihm gut, "
                "ist gar wohl-ge-mut. A-ber Mut-ter wei-net sehr, hat ja nun kein Häns-chen mehr. "
                "Wünsch dir Glück, sagt ihr Blick, kehr nur bald zu-rück!",
         stanzas=["Viele Jahr, trüb und klar, / Hänschen in der Fremde war. / Da besinnt sich das Kind, / ziehet heim geschwind. / "
                  "Doch nun ist’s kein Hänschen mehr, / nein, ein großer Hans ist er; / schwarz gebrannt Stirn und Hand. / Wird er wohl erkannt?",
                  "Eins, zwei, drei gehn vorbei, / wissen nicht, wer das wohl sei. / Schwester spricht: Welch Gesicht! / Kennt den Bruder nicht. / "
                  "Kommt daher die Mutter sein, / schaut ihm kaum ins Aug hinein, / ruft sie schon: Hans, mein Sohn! / Grüß dich Gott, mein Sohn!"]),
    dict(title="Alle meine Entchen", key="G", keyname="G-Dur", time=(2, 4),
         credit="Volksweise",
         music="g'8 a'8 h'8 c''8 | d''4 d''4 , | e''8 e''8 e''8 e''8 | d''2 , | e''8 e''8 e''8 e''8 | d''2 , | / "
               "c''8 c''8 c''8 c''8 | h'4 h'4 , | a'8 a'8 a'8 a'8 | g'2 ||",
         lyrics="Al-le mei-ne Ent-chen schwim-men auf dem See, schwim-men auf dem See, "
                "Köpf-chen in das Was-ser, Schwänz-chen in die Höh."),
    dict(title="Jingle Bells", key="G", keyname="G-Dur", time=(4, 4),
         credit="Text und Melodie: James Lord Pierpont, 1857 · nach jeder Strophe der Refrain",
         # Melodie der Strophe nach de.wikibooks.org „Liederbuch/ Jingle Bells“,
         # Text nach en.wikipedia.org „Jingle Bells“ (Abschnitt Lyrics)
         music="d'4 h'4 a'4 g'4 | d'2. d'8 d'8 | d'4 h'4 a'4 g'4 | e'2. r4 | / "
               "e'4 c''4 h'4 a'4 | fis'2. r4 | d''4 d''4 c''4 a'4 | h'2. r4 | / "
               "d'4 h'4 a'4 g'4 | d'2. r4 | d'4 h'4 a'4 g'4 | e'2. r8 e'8 | / "
               "e'4 c''4 h'4 a'4 | d''4 d''4 d''4. d''8 | e''4 d''4 c''4 a'4 | g'2 d''2 , | / "
               "h'4 h'4 h'2 | h'4 h'4 h'2 | h'4 d''4 g'4. a'8 | h'1 , | / "
               "c''4 c''4 c''4. c''8 | c''4 h'4 h'4 h'8 h'8 | h'4 a'4 a'4 h'4 | a'2 d''2 , | / "
               "h'4 h'4 h'2 | h'4 h'4 h'2 | h'4 d''4 g'4. a'8 | h'1 , | / "
               "c''4 c''4 c''4. c''8 | c''4 h'4 h'4 h'8 h'8 | d''4 d''4 c''4 a'4 | g'1 ||",
         lyrics="Dash-ing through the snow in a one-horse o-pen sleigh, o’er the fields we go, laugh-ing all the way. "
                "Bells on bob tail ring, mak-ing spi-rits bright. What fun it is to ride and sing a sleigh-ing song to-night, oh! "
                "Jin-gle bells, jin-gle bells, jin-gle all the way! Oh, what fun it is to ride "
                "in a one-horse o-pen sleigh, hey! Jin-gle bells, jin-gle bells, jin-gle all the way! "
                "Oh, what fun it is to ride in a one-horse o-pen sleigh!",
         stanza_cols=3,
         stanzas=["A day or two ago / I thought I’d take a ride / And soon, Miss Fanny Bright / Was seated by my side, / "
                  "The horse was lean and lank / Misfortune seemed his lot / He got into a drifted bank / And then we got up sot.",
                  "A day or two ago, / The story I must tell / I went out on the snow, / And on my back I fell; / "
                  "A gent was riding by / In a one-horse open sleigh, / He laughed as there I sprawling lie, / But quickly drove away.",
                  "Now the ground is white / Go it while you’re young, / Take the girls tonight / And sing this sleighing song; / "
                  "Just get a bobtailed bay / Two forty as his speed / Hitch him to an open sleigh / And snap! You’ll take the lead."]),
    dict(title="Morgen kommt der Weihnachtsmann", key="G", keyname="G-Dur", time=(4, 4),
         credit="Text: Hoffmann von Fallersleben · Melodie: französische Weise",
         music="g'4 g'4 d''4 d''4 | e''4 e''4 d''2 , | c''4 c''4 h'4 h'4 | a'2 g'2 , | / "
               "d''4 d''4 c''4 c''4 | h'4 h'4 a'2 , | d''4 d''4 c''4 c''4 | h'4 h'4 a'2 , | / "
               "g'4 g'4 d''4 d''4 | e''4 e''4 d''2 , | c''4 c''4 h'4 h'4 | a'2 g'2 ||",
         lyrics="Mor-gen kommt der Weih-nachts-mann, kommt mit sei-nen Ga-ben. Trom-mel, Pfei-fen und Ge-wehr, "
                "Fahn und Sä-bel und noch mehr, ja ein gan-zes Krie-ges-heer möcht ich ger-ne ha-ben."),
    dict(title="Kling, Glöckchen", key="C", keyname="C-Dur", time=(2, 4),
         credit="Text: Karl Enslin · Melodie: 19. Jahrhundert",
         # Quelle: de.wikibooks.org „Liederbuch/ Kling Glöckchen“ (Notenbild auf Wikimedia Commons, in C)
         music="g'4 e'8 f'8 | g'16 a'16 g'16 a'16 g'4 | f'4 d'8 g'8 | e'2 , | / "
               "d'8 d'8 e'8 c'8 | e'4 d'4 | f'8 f'8 g'8 d'8 | f'4 e'4 , | / "
               "d'8 d'8 e'8 fis'8 | g'4 d'4 | e'8 a'8 g'8 fis'8 | a'4 g'4 , | / "
               "g'4 e'8 f'8 | g'16 a'16 g'16 a'16 g'4 | f'4 d'8 g'8 | c'2 ||",
         lyrics="Kling, Glöck-chen, klin-ge-lin-ge-ling, kling, Glöck-chen, kling! "
                "Lasst mich ein, ihr Kin-der, ist so kalt der Win-ter, "
                "öff-net mir die Tü-ren, lasst mich nicht er-frie-ren! "
                "Kling, Glöck-chen, klin-ge-lin-ge-ling, kling, Glöck-chen, kling!",
         stanzas=["Kling, Glöckchen, klingelingeling, / kling, Glöckchen, kling! / Mädchen, hört, und Bübchen, / "
                  "macht mir auf das Stübchen, / bring euch viele Gaben, / sollt euch dran erlaben. / "
                  "Kling, Glöckchen, klingelingeling, / kling, Glöckchen, kling!",
                  "Kling, Glöckchen, klingelingeling, / kling, Glöckchen, kling! / Hell erglühn die Kerzen, / "
                  "öffnet mir die Herzen! / Will drin wohnen fröhlich, / frommes Kind, wie selig. / "
                  "Kling, Glöckchen, klingelingeling, / kling, Glöckchen, kling!"]),
    dict(title="Bruder Jakob", key="G", keyname="G-Dur", time=(4, 4),
         credit="Volksweise (Frère Jacques)",
         music="g'4 a'4 h'4 g'4 | g'4 a'4 h'4 g'4 , | h'4 c''4 d''2 , | h'4 c''4 d''2 , | / "
               "d''8 e''8 d''8 c''8 h'4 g'4 | d''8 e''8 d''8 c''8 h'4 g'4 , | g'4 d'4 g'2 , | g'4 d'4 g'2 ||",
         lyrics="Bru-der Ja-kob, Bru-der Ja-kob, schläfst du noch? Schläfst du noch? "
                "Hörst du nicht die Glo-cken? Hörst du nicht die Glo-cken? Ding, dang, dong. Ding, dang, dong."),
    dict(title="Leise rieselt der Schnee", key="G", keyname="G-Dur", time=(3, 4),
         credit="Text und Melodie: Eduard Ebel",
         music="h'2 h'4 | a'4 h'4 a'4 | g'2.~ | g'2 r4 | g'2 e'4 | g'4 fis'4 e'4 | d'2.~ | d'2 r4 | / "
               "a'4 gis'4 a'4 | c''4 h'4 a'4 | g'2.~ | g'2 r4 | a'4. e'8 e'4 | fis'4 e'4 fis'4 | g'2.~ | g'2 r4 ||",
         lyrics="Lei-se rie-selt der Schnee, still und starr ruht der See, "
                "weih-nacht-lich glän-zet der Wald: Freu-e dich, Christ-kind kommt bald!",
         stanzas=["In den Herzen ist’s warm, / still schweigt Kummer und Harm, / Sorge des Lebens verhallt: / Freue dich, Christkind kommt bald!",
                  "Bald ist Heilige Nacht, / Chor der Engel erwacht, / hört nur, wie lieblich es schallt: / Freue dich, Christkind kommt bald!"]),
    dict(title="Alle Vögel sind schon da", key="D", keyname="D-Dur", time=(4, 4),
         credit="Text: Hoffmann von Fallersleben · Melodie: Volksweise",
         music="d'4. fis'8 a'4 d''4 | h'4 (d''8 h'8) a'2 , | g'4. a'8 fis'4 d'4 | e'2 d'2 , | / "
               "a'4 a'4 g'4 g'4 | fis'4 (a'8 fis'8) e'2 , | a'4 a'4 g'4 g'4 | fis'4 (a'8 fis'8) e'2 , | / "
               "d'4. fis'8 a'4 d''4 | h'4 (d''8 h'8) a'2 , | g'4. a'8 fis'4 d'4 | e'2 d'2 ||",
         lyrics="Al-le Vö-gel sind schon da, al-le Vö-gel, al-le! Welch ein Sin-gen, Mu-si-ziern, "
                "Pfei-fen, Zwit-schern, Ti-ri-liern! Früh-ling will nun ein-mar-schiern, kommt mit Sang und Schal-le.",
         stanzas=["Wie sie alle lustig sind, / flink und froh sich regen! / Amsel, Drossel, Fink und Star / und die ganze Vogelschar / wünschen dir ein frohes Jahr, / lauter Heil und Segen.",
                  "Was sie uns verkünden nun, / nehmen wir zu Herzen: / Wir auch wollen lustig sein, / lustig wie die Vögelein, / hier und dort, feldaus, feldein, / singen, springen, scherzen."]),
    dict(title="Lasst uns froh und munter sein", key="D", keyname="D-Dur", time=(4, 4),
         credit="Volkslied aus dem Münsterland",
         music="a'4 a'4 (a'8 h'8) (a'8 g'8) | fis'4 fis'4 fis'2 , | g'4 g'4 (g'8 a'8) (g'8 fis'8) | e'4 e'4 e'2 , | / "
               "d'4 e'4 fis'4 g'4 | a'8 h'8 a'8 h'8 a'2 , | d''4 a'4 a'8 h'8 (a'8 g'8) | fis'4 e'4 a'2 , | / "
               "d''4 a'4 a'8 h'8 (a'8 g'8) | fis'4 e'4 d'2 ||",
         lyrics="Lasst uns froh und mun-ter sein und uns recht von Her-zen freun! "
                "Lus-tig, lus-tig, tra-le-ra-la-la, bald ist Ni-ko-laus-a-bend da, bald ist Ni-ko-laus-a-bend da!",
),
    dict(title="Alle Jahre wieder", key="D", keyname="D-Dur", time=(4, 4),
         credit="Text: Wilhelm Hey · Melodie: Friedrich Silcher",
         music="a'4. h'8 a'4 g'4 | fis'2 e'2 , | d'4 (e'8 fis'8) g'4 fis'4 | e'2. r4 | / "
               "fis'4 a'4 h'4 a'4 | d''2 (cis''4 h'4) , | a'4 (g'8 fis'8) g'4 a'4 | fis'2. r4 ||",
         lyrics="Al-le Jah-re wie-der kommt das Chris-tus-kind auf die Er-de nie-der, wo wir Men-schen sind.",
         stanzas=["Kehrt mit seinem Segen / ein in jedes Haus, / geht auf allen Wegen / mit uns ein und aus.",
                  "Steht auch mir zur Seite, / still und unerkannt, / dass es treu mich leite / an der lieben Hand."
                  ]),
    dict(title="Es tanzt ein Bi-Ba-Butzemann", key="G", keyname="G-Dur", time=(4, 4),
         credit="Volksweise · nach G-Dur gesetzt",
         music="d'8 | g'8 g'8 d''8 d''8 h'8 h'8 g'8 g'8 | a'8 a'8 d'8 d'8 g'8 g'16 h'16 d''8 , / d'8 | "
               "g'8 g'8 d''8 d''8 h'8 h'8 g'8 g'8 | a'8 a'8 d'8 d'8 g'4 r8 / g'8 | "
               "a'8 h'8 c''8 a'8 h'8 c''8 d''8 h'8 | a'8 h'8 c''8 a'8 h'8 c''8 d''8 , / d'8 | "
               "g'8 g'8 d''8 d''8 h'8 h'8 g'8 g'8 | a'8 a'8 d'8 d'8 g'4 r8 ||",
         lyrics="Es tanzt ein Bi-Ba-But-ze-mann in un-serm Haus her-um, fi-de-bum, "
                "es tanzt ein Bi-Ba-But-ze-mann in un-serm Haus her-um. "
                "Er rüt-telt sich, er schüt-telt sich, er wirft sein Säck-lein hin-ter sich. "
                "Es tanzt ein Bi-Ba-But-ze-mann in un-serm Haus her-um."),
    dict(title="O Tannenbaum", key="G", keyname="G-Dur", time=(3, 4),
         credit="Text: Ernst Anschütz · Melodie: Volksweise",
         music="d'4 | g'8. g'16 g'4. a'8 | h'8. h'16 h'4. h'8 | a'8 h'8 c''4 fis'4 | a'4 g'4 r8 / d''8 | "
               "d''8 h'8 e''4. d''8 | d''8 c''8 c''4. , c''8 | c''8 a'8 d''4. c''8 | c''8 h'8 h'4 , / d'4 | "
               "g'8. g'16 g'4. a'8 | h'8. h'16 h'4. h'8 | a'8 h'8 c''4 fis'4 | a'4 g'4 ||",
         lyrics="O Tan-nen-baum, o Tan-nen-baum, wie treu sind dei-ne Blät-ter! "
                "Du grünst nicht nur zur Som-mer-zeit, nein, auch im Win-ter, wenn es schneit. "
                "O Tan-nen-baum, o Tan-nen-baum, wie treu sind dei-ne Blät-ter!",
         stanzas=["O Tannenbaum, o Tannenbaum, / du kannst mir sehr gefallen! / Wie oft hat nicht zur Winterszeit / ein Baum von dir mich hoch erfreut! / O Tannenbaum, o Tannenbaum, / du kannst mir sehr gefallen!",
                  "O Tannenbaum, o Tannenbaum, / dein Kleid will mich was lehren: / Die Hoffnung und Beständigkeit / gibt Trost und Kraft zu jeder Zeit. / O Tannenbaum, o Tannenbaum, / dein Kleid will mich was lehren!"]),
    dict(title="ABC, die Katze lief im Schnee", key="D", keyname="D-Dur", time=(4, 4),
         credit="Volksweise",
         music="d'4 fis'4 a'4 r8 d''8 | a'8. g'16 fis'8 e'8 d'4 r8 / a'8 | "
               "g'8 fis'8 e'8 d'8 cis'8 d'8 e'8 , a'8 | g'8 fis'8 e'8 d'8 cis'8 d'8 e'8 , / d'8 | "
               "g'8. g'16 fis'8 d'8 h'8. h'16 a'8 , d''8 | a'8. g'16 fis'8 e'8 d'4 r4 ||",
         lyrics="A, B, C, die Kat-ze lief im Schnee. Und als sie dann nach Hau-se kam, "
                "da hatt sie wei-ße Stie-fel an. O je-mi-ne, o je-mi-ne, die Kat-ze lief im Schnee."),
    dict(title="Stille Nacht, heilige Nacht", key="C", keyname="C-Dur", time=(6, 8),
         credit="Text: Joseph Mohr · Melodie: Franz Xaver Gruber",
         music="(g'4. a'8) g'4 | e'2. , | g'4. a'8 g'4 | e'2. , | d''2 d''4 | h'2. , | c''2 c''4 | g'2. , | / "
               "a'2 a'4 | c''4. h'8 a'4 | g'4. a'8 g'4 | e'2. , | a'2 a'4 | c''4. h'8 a'4 | g'4. a'8 g'4 | e'2. , | / "
               "d''2 d''4 | f''4. d''8 h'4 | (c''2. | e''2.) , | c''4 g'4 e'4 | g'4. f'8 (d'4 | c'2.) ||",
         lyrics="Stil-le Nacht, hei-li-ge Nacht! Al-les schläft, ein-sam wacht nur das trau-te hoch-hei-li-ge Paar. "
                "Hol-der Kna-be im lo-cki-gen Haar, schlaf in himm-li-scher Ruh, schlaf in himm-li-scher Ruh!",
         stanzas=["Stille Nacht, heilige Nacht! / Hirten erst kundgemacht / durch der Engel Halleluja, / tönt es laut von fern und nah: / Christ, der Retter, ist da! / Christ, der Retter, ist da!",
                  "Stille Nacht, heilige Nacht! / Gottes Sohn, o wie lacht / Lieb aus deinem göttlichen Mund, / da uns schlägt die rettende Stund, / Christ, in deiner Geburt! / Christ, in deiner Geburt!"]),

    # ---------------------------------------------------------------- alte Melodien
    dict(chapter="Alte Lieder und Tänze",
         title="Noël nouvelet", key="G", keyname="a-Moll (dorisch)", time=(4, 4),
         credit="Französisch, 15. Jahrhundert · Melodie ohne Text",
         music="a'4 e''4 fis''4 d''4 | e''2 c''2 | d''4 d''8 e''8 c''4 h'4 | a'1 , | / "
               "a'4 e''4 fis''4 d''4 | e''2 c''2 | d''4 d''8 e''8 c''4 h'4 | a'1 , | / "
               "c''2 h'4 a'4 | h'2. , e'4 | c''4 c''4 h'4 a'4 | h'1 , | / "
               "a'4 e''4 fis''4 d''4 | e''2 c''2 | d''4 d''8 e''8 c''4 h'4 | a'1 ||"),
    dict(title="Greensleeves", key="G", keyname="a-Moll (dorisch)", time=(6, 8),
         credit="England, 16. Jahrhundert · Melodie ohne Text",
         music="a'8 | c''4 d''8 e''8. fis''16 e''8 | d''4 h'8 g'8. a'16 h'8 | c''4 a'8 a'8. gis'16 a'8 | h'4 gis'8 e'4 , / a'8 | "
               "c''4 d''8 e''8. fis''16 e''8 | d''4 h'8 g'8. a'16 h'8 | c''8. h'16 a'8 gis'8. fis'16 gis'8 | a'4 a'8 a'4 r8 , | / "
               "g''4. g''8. fis''16 e''8 | d''4 h'8 g'8. a'16 h'8 | c''4 a'8 a'8. gis'16 a'8 | h'4 gis'8 e'4. , | / "
               "g''4. g''8. fis''16 e''8 | d''4 h'8 g'8. a'16 h'8 | c''8. h'16 a'8 gis'8. fis'16 gis'8 | a'4. a'4 ||"),
    dict(title="All in a Garden Green", key="G", keyname="G-Dur", time=(4, 4),
         credit="England, 16. Jahrhundert · Playford, The English Dancing Master (1651) · Melodie ohne Text",
         # Quelle: thesession.org/tunes/14287, Fassung 2 (in 2/2 notiert, hier als 4/4)
         music="|: d''2 d''4 d''4 | h'4. c''8 d''4 d''4 | e''4 d''4 c''4 h'4 | a'2. , h'4 | / "
               "c''4. d''8 e''8 fis''8 g''4 | g'4. a'8 h'8 c''8 d''4 | c''4 h'4 a'8 g'8 a'8 h'8 | g'1 , :| / "
               "|: d''4 d''8 d''8 d''4 d''4 | e''4 fis''4 g''2 , | h'4 h'8 h'8 h'4 g'4 | a'4 h'4 c''2 , | "
               "h'4. a'8 g'8 a'8 h'4 | / c''4. h'8 a'8 h'8 c''4 , | d''4. c''8 h'8 c''8 d''4 | "
               "e''4. d''8 c''8 d''8 h'8 c''8 | a'4 g'4 g'4 fis'4 | g'1 :|"),

    # ---------------------------------------------------------------- hübsche Melodien
    dict(chapter="Schöne Melodien",
         title="The Water Is Wide", key="G", keyname="G-Dur", time=(4, 4),
         credit="Schottisch-englisches Volkslied",
         music="d'4 g'8 a'8 a'4 | h'2. a'8 a'8 | g'4 e'4 d'2~ | d'4 , g'4 g'4 fis'4 | g'2. a'4 | h'4 (c''8 h'8) a'2~ | a'4 , / "
               "a'4 h'4 (h'8 c''8) | d''2. c''8 c''8 | h'4 (a'8 g'8) h'2~ | h'4 , a'4 g'4 e'4 | d'2. d'4 | e'4 g'4 g'2~ | g'4 ||",
         lyrics="The wa-ter is wide, I can-not get o’er, and nei-ther have I wings to fly. "
                "Give me a boat that can car-ry two, and both shall row, my love and I."),
]

EXERCISES = [
    ("Übung 1", "Nur h¹, a¹ und g¹", "C", (4, 4),
     "h'4 a'4 h'2 | a'4 h'4 a'2 , | h'4 a'4 g'2 | g'4 a'4 h'2 , | / h'4 a'4 g'4 a'4 | h'4 h'4 h'2 , | a'4 a'4 h'4 a'4 | g'1 ||"),
    ("Übung 2", "Dazu c² und d²", "C", (4, 4),
     "g'4 a'4 h'4 c''4 | d''2 d''2 , | c''4 h'4 a'4 h'4 | c''1 , | / d''4 c''4 h'4 a'4 | g'2 h'2 , | c''4 d''4 c''4 h'4 | a'4 h'4 g'2 ||"),
    ("Übung 3", "Dazu e¹ und d¹ – tief, also ganz sanft blasen", "C", (4, 4),
     "g'4 e'4 g'4 a'4 | g'2 e'2 , | d'4 e'4 g'4 a'4 | h'1 , | / a'4 g'4 e'4 g'4 | a'2 h'2 , | g'4 e'4 d'4 e'4 | g'1 ||"),
    ("Übung 4", "Dazu fis¹ – G-Dur, das Kreuz gilt für jedes f", "G", (4, 4),
     "g'4 fis'4 g'4 a'4 | h'2 a'2 , | g'4 fis'4 e'4 fis'4 | g'1 , | / d'4 e'4 fis'4 g'4 | a'2 fis'2 , | e'4 fis'4 a'4 fis'4 | g'1 ||"),
    ("Übung 5", "Achtel: zwei Töne auf einen Schlag", "C", (4, 4),
     "g'8 a'8 h'8 a'8 g'2 , | h'8 c''8 d''8 c''8 h'2 , | a'8 h'8 c''8 h'8 a'4 h'4 | g'1 ||"),
]

# Für später notiert (ohne erreichbare Quelle): Tourdion (Attaingnant 1530),
# Pavane „Belle qui tiens ma vie“ (Arbeau), Branle de l'Official (Arbeau),
# Ronde aus Susatos Danserye, Innsbruck ich muss dich lassen (Isaac),
# Es ist ein Ros entsprungen, Kling Glöckchen, Fuchs du hast die Gans gestohlen.
